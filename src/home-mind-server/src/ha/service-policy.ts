/**
 * What the assistant may ask Home Assistant to do, and in what shape.
 *
 * Home Assistant runs every service call with the server's own token (the
 * add-on's Supervisor token, or an administrator's long-lived token), not the
 * rights of whoever is talking, and integrations add services of their own
 * that can act on more than the entity they name. So the assistant gets an
 * allowlist: the everyday device control Home Assistant's own assistant
 * offers, and nothing else. Add to it deliberately. A user who wants the
 * assistant to run something more can put that in a script and expose it.
 *
 * Every name the model hands over is also checked for shape before it becomes
 * part of a request path (`/api/services/<domain>/<service>`,
 * `/api/states/<entity_id>`), so a name only ever addresses the endpoint it
 * was checked for.
 */

/** A domain or service name, as Home Assistant itself requires them. */
const NAME_SHAPE = /^[a-z0-9_]+$/;

/** An entity id: `domain.object_id`, lower case. */
export const ENTITY_ID_SHAPE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const ON_OFF = ["turn_on", "turn_off", "toggle"];
const SELECT = ["select_option", "select_next", "select_previous", "select_first", "select_last"];

/** The services the assistant may call, by domain. */
const ALLOWED_SERVICES: Readonly<Record<string, ReadonlySet<string>>> = Object.fromEntries(
  Object.entries({
    light: ON_OFF,
    switch: ON_OFF,
    fan: [
      ...ON_OFF,
      "set_percentage",
      "increase_speed",
      "decrease_speed",
      "oscillate",
      "set_direction",
      "set_preset_mode",
    ],
    cover: [
      "open_cover",
      "close_cover",
      "stop_cover",
      "toggle",
      "set_cover_position",
      "open_cover_tilt",
      "close_cover_tilt",
      "stop_cover_tilt",
      "toggle_cover_tilt",
      "set_cover_tilt_position",
    ],
    valve: ["open_valve", "close_valve", "stop_valve", "toggle", "set_valve_position"],
    lock: ["lock", "unlock", "open"],
    climate: [
      ...ON_OFF,
      "set_temperature",
      "set_humidity",
      "set_hvac_mode",
      "set_preset_mode",
      "set_fan_mode",
      "set_swing_mode",
      "set_swing_horizontal_mode",
    ],
    water_heater: ["turn_on", "turn_off", "set_temperature", "set_operation_mode", "set_away_mode"],
    humidifier: [...ON_OFF, "set_humidity", "set_mode"],
    media_player: [
      ...ON_OFF,
      "volume_up",
      "volume_down",
      "volume_set",
      "volume_mute",
      "media_play",
      "media_pause",
      "media_play_pause",
      "media_stop",
      "media_next_track",
      "media_previous_track",
      "media_seek",
      "play_media",
      "browse_media",
      "search_media",
      "select_source",
      "select_sound_mode",
      "shuffle_set",
      "repeat_set",
      "clear_playlist",
      "join",
      "unjoin",
    ],
    vacuum: [
      ...ON_OFF,
      "start",
      "pause",
      "stop",
      "return_to_base",
      "locate",
      "clean_spot",
      "set_fan_speed",
    ],
    lawn_mower: ["start_mowing", "pause", "dock"],
    remote: ON_OFF,
    siren: ON_OFF,
    alarm_control_panel: [
      "alarm_arm_away",
      "alarm_arm_home",
      "alarm_arm_night",
      "alarm_arm_vacation",
      "alarm_arm_custom_bypass",
      "alarm_disarm",
    ],
    camera: ["turn_on", "turn_off", "enable_motion_detection", "disable_motion_detection"],
    scene: ["turn_on", "apply", "create"],
    script: ON_OFF,
    automation: ON_OFF,
    homeassistant: [...ON_OFF, "update_entity"],
    button: ["press"],
    input_button: ["press"],
    input_boolean: ON_OFF,
    input_number: ["set_value", "increment", "decrement"],
    input_select: SELECT,
    input_text: ["set_value"],
    input_datetime: ["set_datetime"],
    number: ["set_value"],
    select: SELECT,
    text: ["set_value"],
    date: ["set_value"],
    time: ["set_value"],
    datetime: ["set_value"],
    counter: ["increment", "decrement", "reset", "set_value"],
    timer: ["start", "pause", "cancel", "finish", "change"],
    todo: ["add_item", "update_item", "remove_item", "remove_completed_items", "get_items"],
    shopping_list: [
      "add_item",
      "remove_item",
      "complete_item",
      "incomplete_item",
      "complete_all",
      "incomplete_all",
      "clear_completed_items",
      "sort",
    ],
    calendar: ["get_events", "create_event"],
    weather: ["get_forecasts"],
    assist_satellite: ["announce"],
    tts: ["speak"],
  }).map(([domain, services]) => [domain, new Set(services)])
);

/** Lifecycle services of the script domain; any other `script.X` runs script X. */
export const SCRIPT_LIFECYCLE: ReadonlySet<string> = new Set(["turn_on", "turn_off", "toggle", "reload"]);

/**
 * Domains whose services are meant to be called without naming an entity and
 * act on nothing in the house: the per-device notify services
 * (`notify.mobile_app_<phone>`) and the shopping list.
 */
export const UNTARGETED_DOMAINS: ReadonlySet<string> = new Set(["notify", "shopping_list"]);

/**
 * Voice engines (`tts.*`). Home Assistant exposes none by default, and an
 * engine is heard only through a speaker, so the exposure list lets them
 * through; for the same reason one does not count as naming what a call acts on.
 */
export function isVoiceEngine(entityId: string): boolean {
  return ENTITY_ID_SHAPE.test(entityId) && entityId.startsWith("tts.");
}

function isAllowed(domain: string, service: string): boolean {
  if (ALLOWED_SERVICES[domain]?.has(service)) return true;
  if (domain === "script") return !SCRIPT_LIFECYCLE.has(service); // script.<name>, vetted by name
  if (domain === "notify") return true; // notify.<service> and notify.send_message, see notifyRefusal
  if (domain === "tts") return service.endsWith("_say"); // the older per-engine services
  return false;
}

/** Throws unless `domain` and `service` are plain Home Assistant names. */
export function assertServiceName(domain: unknown, service: unknown): void {
  if (typeof domain !== "string" || !NAME_SHAPE.test(domain)) {
    throw new Error(
      `Invalid service domain ${JSON.stringify(domain)}: a domain is a single lower-case word ` +
        `such as "light" or "media_player".`
    );
  }
  if (typeof service !== "string" || !NAME_SHAPE.test(service)) {
    throw new Error(
      `Invalid service name ${JSON.stringify(service)}: a service is a single lower-case word ` +
        `such as "turn_on" or "set_temperature".`
    );
  }
}

/**
 * The entity id in the form Home Assistant stores it (trimmed, lower case), or
 * an error that tells the model what an entity id looks like.
 */
export function normalizeEntityId(entityId: unknown): string {
  const id = typeof entityId === "string" ? entityId.trim().toLowerCase() : "";
  if (!ENTITY_ID_SHAPE.test(id)) {
    throw new Error(
      `Invalid entity_id ${JSON.stringify(entityId)}: an entity id is one entity, written ` +
        `domain.name, such as "light.kitchen". Find the right one with search_entities.`
    );
  }
  return id;
}

/**
 * Why the assistant may not call `domain.service`, or `null` when it may.
 *
 * @param targeted Whether the call names what it acts on: an entity other than
 *   a voice engine, or an area, device, floor or label (which the exposure
 *   check then refuses or allows on its own).
 */
export function serviceRefusal(domain: string, service: string, targeted: boolean): string | null {
  if (!isAllowed(domain, service)) {
    return (
      `${domain}.${service} is not available to you. You can control devices the user has ` +
      `exposed (lights, switches, fans, covers, locks, climate, media players, vacuums and the ` +
      `like), run their exposed scripts and scenes, set helpers and timers, use their to-do ` +
      `lists, calendars and weather, and send notifications. Do not look for another way to do ` +
      `it. Tell the user to do it in Home Assistant; if they want you to be able to run it, they ` +
      `can put it in a script and expose that script to the assistant.`
    );
  }
  if (!targeted && !UNTARGETED_DOMAINS.has(domain)) {
    return (
      `${domain}.${service} names no entity, so it cannot be checked against what the user ` +
      `exposed to the assistant. Call it again with the exposed entity_id(s) it should act on.`
    );
  }
  return null;
}

/**
 * Notification texts the Home Assistant companion app treats as commands to
 * the phone (open an app, change Do Not Disturb, report its location, speak on
 * the alarm stream) rather than as a message to show.
 */
const PHONE_COMMANDS = /^\s*(command_\w*|request_location_update|clear_notification|remove_channel|tts)\s*$/i;

/** The text of a message with its template blocks taken out. */
function literalText(message: string): string {
  return message.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, "");
}

/**
 * Why a notification may not be sent as given, or `null`. The assistant may
 * send a message to the recipients the user configured, but not pick its own
 * (`target` on the per-service notify calls, which on email or messaging
 * services reaches anyone), and not send the companion app's phone commands,
 * written out or assembled by a template.
 *
 * @param target A `target` given beside the payload, as an automation step has.
 */
export function notifyRefusal(
  service: string,
  payload: Record<string, unknown>,
  target: unknown = undefined
): string | null {
  const data =
    payload.data && typeof payload.data === "object" ? (payload.data as Record<string, unknown>) : {};
  // notify.send_message targets notify entities, which the exposure list vets.
  if (service !== "send_message" && (target ?? payload.target ?? data.target) !== undefined) {
    return (
      `A notification's "target" is not available to you: send it without one, to the ` +
      `recipients the user set up for that notify service.`
    );
  }
  const message = payload.message;
  if (typeof message === "string") {
    const templated = literalText(message) !== message;
    // The message as rendered, with the whitespace that `-` markers strip
    // already gone. A phone command is one word, so a template that touches
    // a word of the text could complete it into one.
    const joined = message
      .replace(/\s*(\{\{-|\{%-|\{#-)/g, "$1")
      .replace(/(-\}\}|-%\}|-#\})\s*/g, "$1");
    const literal = literalText(joined).trim();
    if (templated && literal === "") {
      return `A notification's message must include some plain text, not only a template.`;
    }
    const touches = /[A-Za-z0-9_]\{[{%#]|[}%#]\}[A-Za-z0-9_]/.test(joined);
    if (PHONE_COMMANDS.test(literal) || (templated && touches)) {
      return (
        `That message is, or could become, a command to the phone, not a notification, and is ` +
        `not available to you. Send a plain message instead.`
      );
    }
  }
  return null;
}

/**
 * media-source providers the assistant may play and browse: Home Assistant's
 * voices, radio, and music and video libraries. Providers of camera and
 * doorbell recordings, photo libraries, a computer's files and game clips are
 * left out, and so is any provider not listed here. The local media folder
 * (`media_source`) is allowed for audio files only, because camera add-ons
 * write their recordings there.
 */
const MEDIA_SOURCES: ReadonlySet<string> = new Set(["tts", "radio_browser", "jellyfin", "dlna_dms"]);

/** Audio files the assistant may play from the local media folder. */
const LOCAL_AUDIO = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|wma|aiff?)$/i;

/** Url schemes whose address Home Assistant or a player fetches over the network or from disk. */
const FETCHED_SCHEMES =
  /^(https?|rtsps?|rtmps?|rtp|mms|ftps?|sftp|udp|tcp|srt|file|smb|nfs|wss?|data):/i;

/** Keys that hold a media id, at any depth of a call's fields. */
const MEDIA_ID_KEY = /(^|_)media(_content)?_id$/;

function mediaIds(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) mediaIds(item, into);
  } else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (MEDIA_ID_KEY.test(key) && typeof inner === "string") into.push(inner);
      else mediaIds(inner, into);
    }
  }
  return into;
}

function mediaAllowed(raw: string, browsing: boolean): boolean {
  const id = raw.trim();
  if (id.includes("{{") || id.includes("{%")) return false; // rendered later, so unknown now
  if (id.startsWith("/")) return false; // a path on Home Assistant itself
  if (/^media-source:/i.test(id)) {
    const source = /^media-source:\/\/([a-z0-9_]+)(\/(.*))?$/.exec(id);
    if (!source) return false;
    if (MEDIA_SOURCES.has(source[1])) return true;
    return source[1] === "media_source" && (browsing || LOCAL_AUDIO.test(source[3] ?? ""));
  }
  // An address Home Assistant or the player would fetch. Even a public-looking
  // name can point back into the house, so none is allowed; radio stations
  // cover streams.
  return !FETCHED_SCHEMES.test(id);
}

/**
 * Why a media id may not be played or browsed, or `null`. Media sources reach
 * far more than the player they play on, and Home Assistant or the player
 * fetches some addresses itself, so the assistant may use only the providers
 * in `MEDIA_SOURCES` and audio from the local media folder. Ids an integration
 * resolves on its own (`plex://...`, `library://...`, `spotify:...`, a
 * favourite) are left to the player.
 *
 * @param browsing Browsing lists what a folder holds; playing needs an audio file.
 */
export function mediaRefusal(payload: Record<string, unknown>, browsing = false): string | null {
  for (const id of mediaIds(payload)) {
    if (!mediaAllowed(id, browsing)) {
      return (
        `That media (${id.trim().slice(0, 80)}) is not available to you. You can play the ` +
        `user's music and video libraries, radio stations, audio from their local media folder ` +
        `and streaming services; not camera recordings, photo libraries or web addresses.`
      );
    }
  }
  return null;
}

/** Domains whose calls can carry a security code. */
export const CODE_DOMAINS: ReadonlySet<string> = new Set(["alarm_control_panel", "lock"]);
