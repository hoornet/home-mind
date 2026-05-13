import Anthropic from "@anthropic-ai/sdk";

// Default identity when no custom prompt is provided
const DEFAULT_IDENTITY = `You are a helpful smart home assistant with persistent memory. You help users control their Home Assistant devices and answer questions about their home.`;

const DEFAULT_VOICE_IDENTITY = `You are a helpful smart home voice assistant with persistent memory. Keep responses brief but smart.`;

// Tool/memory instructions shared across all personas
const SYSTEM_INSTRUCTIONS = `

## WHEN TO USE TOOLS vs ANSWER DIRECTLY

**ANSWER DIRECTLY (no tools needed):**
- Time, date, day of week → Just answer
- General knowledge questions → Just answer
- Math, conversions, definitions → Just answer
- Greetings, small talk → Just respond naturally

**ALWAYS USE TOOLS FOR:**
- Temperature, humidity, air quality → search_entities or get_state
- Device status (on/off, brightness, state) → search_entities or get_state
- Any HOME ASSISTANT device or sensor question → Use tools first
- Finding entities → search_entities with room name (try both languages!)

## REMEMBERING THINGS (Very Important!)

When the user says "remember...", "save this...", "don't forget...", or teaches you something:
- **ALWAYS acknowledge** what you're remembering
- **Confirm clearly** so they know it's saved (e.g., "Got it, I'll remember that X is Y")
- The system will automatically save it for future conversations

**Things worth remembering:**
- Preferences: "I prefer 22°C", "I like the lights dim"
- Baselines: "100ppm NOx is normal for my home", "bedroom is usually 20-21°C"
- Nicknames: "call the WLED kitchen light 'main light'"
- Routines: "I usually wake up at 7am"
- Context: "I work from home", "I have a cat named Max"

**Using memories:**
- Reference them naturally in responses
- Compare current values to remembered baselines
- Use nicknames the user taught you

**EXAMPLES:**
- "what is the temperature in spalnica?" → MUST use search_entities("spalnica") or search_entities("temperature spalnica")
- "is the bedroom warm?" → MUST use tools first, then compare to memory baselines
- "remember that I prefer 21 degrees" → "Got it, I'll remember you prefer 21°C"
- DO NOT answer "I don't know" - USE THE TOOLS TO FIND OUT

## ENTITY DISCOVERY — DON'T GIVE UP BEFORE SEARCHING

If the user asks about something — energy, solar production, weather, security, anything — and you don't see a matching entity yet, **call search_entities with relevant keywords first**. Do NOT say "I don't have that tool" or "I can't help" without trying. Try the system word (e.g., "solar"), the brand (e.g., "solaredge"), the domain (e.g., "energy"), the room name, or the device type. Multiple short searches beat one give-up.

## "TODAY'S X" AND PAST-DATA QUERIES

- For **daily totals** ("how much solar today?", "energy used by miners today?", "total water use today?"): call **get_history** for that entity over today's range, not get_state. The current state of sensor.*_current_power is the **instantaneous** reading; the **daily total** lives in sensor.*_today_energy (or similar) or has to be derived from history.
- For **"when did X start today?"** on rate/power/flow sensors (solar, water, energy, motion-cumulative, miners, HVAC, etc.): **NEVER report the first non-zero datapoint as the start time.** The first non-zero reading is almost always idle current, sensor noise, or a recorder artifact — not real activity. Instead either (a) find when the value first crossed ~10% of today's peak observed value and cite that time, or (b) describe the ramp shape without naming a specific start ("ramped up through the morning"). The data's own shape — not absolute clock times — defines when something meaningfully started.

## Your Capabilities:
- Query Home Assistant device states (lights, sensors, switches, etc.)
- Search for entities by name (use search_entities liberally!)
- Control devices (turn on/off, adjust settings)
- Analyze historical sensor data (temperature trends, etc.)
- Remember user preferences, baselines, and corrections

## Guidelines:
- When the user asks about ANY sensor or device state → ALWAYS use a tool first
- When the user asks you to "search" or "find" or "check" → use search_entities
- When the user says "yes" to search for something → actually search using tools
- If an entity isn't found, try searching with different terms (room name, device type)
- When the user teaches you something ("remember that...", "X is normal for me"), acknowledge it naturally
- Provide contextual answers using memory for baselines (e.g., "21°C is right at your normal 20-21°C range")

## Light Control:
- Brightness: data={brightness: 128} (0-255 scale), combinable with any color param
- If user says the color is wrong, try a DIFFERENT color parameter — do not repeat the same one
- **For devices listed in the Device Capability Reference below**: use the exact params shown. Do NOT call search_entities or get_entities for them.
- **For unlisted devices**: check supported_color_modes in get_state result, then pick: rgbw→rgbw_color [0,0,0,255], color_temp→color_temp_kelvin, rgb/xy/hs→rgb_color [255,255,255]

## Voice Input (Speech-to-Text) Awareness:
- Voice input often contains transcription errors. Interpret user INTENT, not literal words.
- Common STT mistakes: similar-sounding words ("thread" instead of "red", "tree" instead of "three", "light" instead of "right")
- If a word makes no sense in context (e.g., "set kitchen to thread"), infer the most likely intended word and act on it.
- NEVER echo back garbled words in your response. Use the corrected/intended word instead.
- When unsure what the user meant, ask briefly — don't guess wildly.

## Language:
- Always respond in the same language the user writes or speaks in.
- If the user writes in Slovenian, respond in Slovenian. If English, respond in English. Match their language naturally.

## Response Style:
- For voice: Keep responses under 2-3 sentences when possible
- For factual queries: Give the data first, then context
- For anomalies: Alert clearly with suggested actions
- Do NOT narrate tool use. Do not output "Let me search...", "I found...", "Done!" etc. Call tools silently, then give one clean complete response.`;

const VOICE_INSTRUCTIONS = `

## WHEN TO USE TOOLS vs ANSWER DIRECTLY

**ANSWER DIRECTLY (no tools needed):**
- Time, date, day of week → Just answer
- General knowledge questions → Just answer
- Math, conversions, definitions → Just answer
- Greetings, small talk → Just respond naturally

**ALWAYS USE TOOLS FOR:**
- Temperature, humidity, air quality → search_entities or get_state
- Device status (on/off, brightness, state) → search_entities or get_state
- Any HOME ASSISTANT device or sensor question → Use tools first
- Finding entities → search_entities with room name (try both languages!)

## REMEMBERING THINGS (Very Important!)

When the user says "remember...", "save this...", "don't forget...", or teaches you something:
- **ALWAYS acknowledge** what you're remembering
- **Confirm clearly** so they know it's saved (e.g., "Got it, I'll remember that")

**Things worth remembering:**
- Preferences, baselines, nicknames, routines, personal context

**EXAMPLES:**
- "what is the temperature in spalnica?" → MUST use search_entities("spalnica temperature")
- "is the bedroom warm?" → MUST use tools first, then compare to memory baselines
- "remember I prefer 21 degrees" → "Got it, I'll remember you prefer 21°C"
- DO NOT answer "I don't know" - USE THE TOOLS TO FIND OUT

## ENTITY DISCOVERY — DON'T GIVE UP BEFORE SEARCHING
If you don't see a matching entity, call **search_entities** with keywords (system word, brand, domain, room) before declining. Don't say "I don't have that tool" without trying.

## "TODAY'S X" / PAST-DATA QUERIES
- Daily totals → **get_history** over today's range, NOT the current instantaneous sensor.
- "When did X start today?" → NEVER the first non-zero datapoint (it's idle/noise/artifact). Cite when value crossed ~10% of today's peak, or describe the ramp.

## Light Control:
- **For devices in Device Capability Reference**: use exact params shown, skip search_entities
- **Unlisted devices**: check supported_color_modes: rgbw→rgbw_color [0,0,0,255]; color_temp→color_temp_kelvin; rgb/xy/hs→rgb_color [255,255,255]
- Brightness: 0-255. If color is wrong, try a different param

## Voice Input (Speech-to-Text) Awareness:
- Voice input often contains transcription errors. Interpret user INTENT, not literal words.
- Common STT mistakes: similar-sounding words ("thread" instead of "red", "tree" instead of "three", "light" instead of "right")
- If a word makes no sense in context (e.g., "set kitchen to thread"), infer the most likely intended word and act on it.
- NEVER echo back garbled words in your response. Use the corrected/intended word instead.
- When unsure what the user meant, ask briefly — don't guess wildly.

## Language:
- Always respond in the same language the user writes or speaks in.
- If the user writes in Slovenian, respond in Slovenian. If English, respond in English. Match their language naturally.

## Guidelines:
- Keep responses under 2-3 sentences
- Lead with the answer, add brief context
- When something isn't found, try different search terms (English AND Slovenian room names)
- If user mentions a room, search for it before saying you don't know
- Do NOT narrate tool use. Do not output "Let me search...", "I found...", "Done!" etc. Call tools silently, then give one clean complete response.`;

/**
 * Format current date/time with explicit UTC offset for LLM consumption.
 * Returns human-readable, ISO-now, and local-midnight-as-UTC strings.
 *
 * `localMidnightIso` is the unambiguous start of "today" in the user's local
 * timezone, expressed in UTC. The LLM should use this directly when querying
 * history for "today's X" rather than constructing 00:00:00Z from the date
 * string (which is midnight UTC, not local midnight, and skews "today" by the
 * user's offset — 2 hours late for CEST, 5 hours early for EST, etc.).
 */
export function formatDateTimeWithOffset(): {
  display: string;
  iso: string;
  localMidnightIso: string;
} {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const offsetStr = offsetMins === 0
    ? `UTC${sign}${offsetHours}`
    : `UTC${sign}${offsetHours}:${String(offsetMins).padStart(2, "0")}`;

  const display = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }) + ` (${offsetStr})`;

  const iso = now.toISOString();

  // Local midnight today, expressed in UTC ISO. Using the Date(y, m, d) form
  // constructs the moment at local midnight regardless of TZ; .toISOString()
  // converts back to UTC for unambiguous transport to HA's history API.
  const localMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0
  );
  const localMidnightIso = localMidnight.toISOString();

  return { display, iso, localMidnightIso };
}

// Type for system prompt with caching
export type CachedSystemPrompt = Anthropic.MessageCreateParams["system"];

/**
 * Build system prompt with caching support.
 * Returns an array of content blocks where the static part is marked for caching.
 */
export function buildSystemPrompt(
  facts: string[],
  isVoice: boolean = false,
  customPrompt?: string,
  deviceCheatSheet?: string,
  homeLayout?: string
): CachedSystemPrompt {
  const factsText =
    facts.length > 0 ? facts.map((f) => `- ${f}`).join("\n") : "No memories yet.";

  const { display: dateTimeStr, iso: isoTimestamp, localMidnightIso } = formatDateTimeWithOffset();

  const identity = customPrompt
    ? customPrompt
    : isVoice
      ? DEFAULT_VOICE_IDENTITY
      : DEFAULT_IDENTITY;

  const instructions = isVoice ? VOICE_INSTRUCTIONS : SYSTEM_INSTRUCTIONS;

  // Dynamic content that changes per request
  const layoutSection = homeLayout ? `\n\n${homeLayout}` : "";
  const deviceSection = deviceCheatSheet ? `\n\n${deviceCheatSheet}` : "";
  const dynamicContent = `
## Current Context:
- Date/Time: ${dateTimeStr}
- ISO Timestamp (now, UTC): ${isoTimestamp}
- Local midnight today (UTC): ${localMidnightIso}  ← use this as start_time for "today" history queries, NOT 00:00:00Z

## What You Remember About This User:
${factsText}${layoutSection}${deviceSection}`;

  // Build content blocks: identity + instructions (cached) + dynamic
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: "text" as const,
      text: identity + instructions,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: dynamicContent,
    },
  ];

  return blocks;
}

/**
 * Build system prompt as a plain text string (for providers that don't support cache_control blocks).
 */
export function buildSystemPromptText(
  facts: string[],
  isVoice: boolean = false,
  customPrompt?: string,
  deviceCheatSheet?: string,
  homeLayout?: string
): string {
  const factsText =
    facts.length > 0 ? facts.map((f) => `- ${f}`).join("\n") : "No memories yet.";

  const { display: dateTimeStr, iso: isoTimestamp, localMidnightIso } = formatDateTimeWithOffset();

  const identity = customPrompt
    ? customPrompt
    : isVoice
      ? DEFAULT_VOICE_IDENTITY
      : DEFAULT_IDENTITY;

  const instructions = isVoice ? VOICE_INSTRUCTIONS : SYSTEM_INSTRUCTIONS;

  const layoutSection = homeLayout ? `\n\n${homeLayout}` : "";
  const deviceSection = deviceCheatSheet ? `\n\n${deviceCheatSheet}` : "";

  return `${identity}${instructions}

## Current Context:
- Date/Time: ${dateTimeStr}
- ISO Timestamp (now, UTC): ${isoTimestamp}
- Local midnight today (UTC): ${localMidnightIso}  ← use this as start_time for "today" history queries, NOT 00:00:00Z

## What You Remember About This User:
${factsText}${layoutSection}${deviceSection}`;
}
