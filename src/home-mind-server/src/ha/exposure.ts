import type { EntityState } from "./client.js";

/**
 * The set of entities exposed to Assist, cached and shared.
 *
 * Home Assistant's own conversation agent decides what an assistant may see and
 * touch from exactly one list — `async_should_expose` in
 * `homeassistant/components/homeassistant/llm.py` filters `states.async_all()`
 * before anything downstream sees it, and the survivors are what both the
 * prompt and the live-context tool are built from. An entity the user has not
 * exposed is therefore not "cheaper to reach"; it does not exist for the
 * assistant at all.
 *
 * This object is that list, read once per TTL and handed to everything that
 * needs it: the topology scanner for the prompt, the HA client for the tools.
 * Before it existed the two disagreed — the layout honoured the user's choices
 * while `search_entities` went straight to `/api/states` and returned all 7,600
 * entities of the house, so the model could read and drive things the user had
 * deliberately kept out of Assist.
 *
 * "No opinion" is a real answer and is not the same as "expose nothing": an old
 * Home Assistant, a token without websocket access, a network error, or a user
 * who has exposed nothing all yield `null`, and `null` means do not filter. The
 * alternative — a failed websocket call leaving the assistant unable to see a
 * single device in the house — is far worse than the leak it would close.
 */
/**
 * Domains the assistant may use whether or not they are exposed. A voice
 * engine (`tts.*`) is not a device in the house: it can only be heard through
 * a speaker, and the speaker is checked (`media_player_entity_id`). Home
 * Assistant exposes no engine by default, so requiring one exposed would block
 * every announcement while protecting nothing.
 */
const ALWAYS_ALLOWED_DOMAINS = ["tts"];

function alwaysAllowed(entityId: string): boolean {
  return ALWAYS_ALLOWED_DOMAINS.some((d) => entityId.startsWith(`${d}.`));
}

export class AssistExposure {
  private entities: Set<string> | null = null;
  /** When the cached answer (a list or "no opinion") stops being good. */
  private expiresAt = 0;
  private inFlight: Promise<Set<string> | null> | null = null;

  /**
   * @param fetcher Reads the exposure list; returns `null` when it cannot.
   * @param ttlMs How long a read stays good. Matches the topology scan interval:
   *   the user can expose an entity at any time, and a stale set would keep
   *   hiding a device they just added.
   */
  constructor(
    private readonly fetcher: () => Promise<Set<string> | null>,
    private readonly ttlMs = 30 * 60 * 1000,
    private readonly retryMs = 60 * 1000
  ) {}

  /** The exposed entity IDs, or `null` for "no opinion". */
  async list(): Promise<Set<string> | null> {
    // "No opinion" is cached too, or every tool call in a home that exposes
    // nothing would open a websocket of its own.
    if (Date.now() < this.expiresAt) {
      return this.entities;
    }
    // Several tool calls run in parallel in one turn; without this they would
    // each open their own websocket on the first call after a restart.
    this.inFlight ??= this.refresh();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async refresh(): Promise<Set<string> | null> {
    let fetched: Set<string> | null = null;
    try {
      fetched = await this.fetcher();
    } catch (err) {
      console.warn(
        `[exposure] Could not refresh the exposure list: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    // A failed read (thrown, or `null` — which is how fetchExposedEntities
    // reports one) must not widen what the model can reach, so the last good
    // answer stands; retry soon rather than on every tool call.
    if (fetched === null) {
      this.expiresAt = Date.now() + this.retryMs;
      return this.entities;
    }
    // An empty list means "exposed nothing", which is indistinguishable in
    // practice from a home that has never opened that settings page — treat it
    // as no opinion rather than as a house with no devices.
    this.entities = fetched.size > 0 ? fetched : null;
    this.expiresAt = Date.now() + this.ttlMs;
    return this.entities;
  }

  /** Whether the assistant may see and act on this entity. */
  async allows(entityId: string): Promise<boolean> {
    if (alwaysAllowed(entityId)) return true;
    const exposed = await this.list();
    return exposed === null || exposed.has(entityId);
  }

  /**
   * The subset of `states` the assistant may see, in the order given. Voice
   * engines stay in, so the assistant can find the one to announce with.
   */
  async filter(states: EntityState[]): Promise<EntityState[]> {
    const exposed = await this.list();
    if (exposed === null) return states;
    return states.filter((s) => exposed.has(s.entity_id) || alwaysAllowed(s.entity_id));
  }
}

/**
 * What the model is told when it reaches for something it may not have.
 *
 * Phrased so it stops rather than retries: a model that reads "not found" tries
 * spelling variants, and there are plenty of them in a house whose entity IDs
 * it has just seen half of.
 */
export function notExposedMessage(entityId: string): string {
  return (
    `${entityId} is not available to you. It may exist in Home Assistant, but the user has not ` +
    `exposed it to the assistant (Settings → Voice assistants → Expose), so it is out of scope. ` +
    `Do not retry with a different spelling — tell the user it is not exposed.`
  );
}
