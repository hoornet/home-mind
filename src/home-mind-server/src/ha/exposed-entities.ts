import { WebSocket } from "undici";

/**
 * Reads the entities the user has exposed to Assist.
 *
 * This is Home Assistant's own answer to "what should a voice assistant see",
 * curated by hand in Settings → Voice assistants → Expose, and it is what the
 * built-in conversation agent uses to build its prompt. Honouring it makes the
 * home layout match what the user already decided, instead of guessing.
 *
 * It is only reachable over the websocket API: the exposure list is in neither
 * `/api/states` nor the template engine. This is the one websocket call in the
 * server — a single request/response on the topology scan interval, not a
 * subscription — and every failure is non-fatal, because the caller falls back
 * to filtering by domain.
 */

/** Milliseconds to wait for connect + auth + result before giving up. */
const TIMEOUT_MS = 8000;

interface ExposedEntitiesResult {
  exposed_entities: Record<string, { conversation?: boolean }>;
}

/**
 * Derives the websocket URL from the REST base URL.
 *
 * Behind the Supervisor proxy (`http://supervisor/core`) the websocket lives at
 * `/core/websocket` and authenticates with the add-on's own token. Everywhere
 * else it is the standard `/api/websocket`. Sending the Supervisor token to
 * `/api/websocket` is rejected with `auth_invalid`, so this distinction is not
 * cosmetic.
 */
export function websocketUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const ws = base.replace(/^http/, "ws");
  return /\/core$/.test(base) ? `${ws}/websocket` : `${ws}/api/websocket`;
}

/**
 * @returns the entity IDs exposed to the conversation agent, or `null` when the
 *   list could not be read — an old Home Assistant, a token without websocket
 *   access, or a network error. `null` means "no opinion", not "expose nothing".
 */
export async function fetchExposedEntities(
  baseUrl: string,
  token: string
): Promise<Set<string> | null> {
  const url = websocketUrl(baseUrl);

  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (err) {
      console.warn(`[exposure] Could not open ${url}: ${describe(err)}`);
      return resolve(null);
    }

    let settled = false;
    const finish = (value: Set<string> | null, reason?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (reason) console.warn(`[exposure] ${reason}`);
      try {
        socket.close();
      } catch {
        // Already closing or never opened — nothing to do.
      }
      resolve(value);
    };

    const timer = setTimeout(
      () => finish(null, `No answer from ${url} within ${TIMEOUT_MS} ms`),
      TIMEOUT_MS
    );

    socket.addEventListener("error", () => finish(null, `Websocket error on ${url}`));
    socket.addEventListener("close", () => finish(null));

    socket.addEventListener("message", (event) => {
      let msg: { type?: string; result?: ExposedEntitiesResult };
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return finish(null, "Websocket sent something that is not JSON");
      }

      switch (msg.type) {
        case "auth_required":
          socket.send(JSON.stringify({ type: "auth", access_token: token }));
          return;
        case "auth_ok":
          socket.send(JSON.stringify({ id: 1, type: "homeassistant/expose_entity/list" }));
          return;
        case "auth_invalid":
          return finish(null, "Websocket rejected the token");
        case "result": {
          const exposed = msg.result?.exposed_entities;
          if (!exposed) return finish(null, "Home Assistant returned no exposure list");
          const ids = Object.entries(exposed)
            .filter(([, settings]) => settings?.conversation)
            .map(([entityId]) => entityId);
          return finish(new Set(ids));
        }
        default:
          return;
      }
    });
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
