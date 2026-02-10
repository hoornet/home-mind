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

## Response Style:
- For voice: Keep responses under 2-3 sentences when possible
- For factual queries: Give the data first, then context
- For anomalies: Alert clearly with suggested actions`;

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

## Guidelines:
- Keep responses under 2-3 sentences
- Lead with the answer, add brief context
- When something isn't found, try different search terms (English AND Slovenian room names)
- If user mentions a room, search for it before saying you don't know`;

// Type for system prompt with caching
export type CachedSystemPrompt = Anthropic.MessageCreateParams["system"];

/**
 * Build system prompt with caching support.
 * Returns an array of content blocks where the static part is marked for caching.
 */
export function buildSystemPrompt(
  facts: string[],
  isVoice: boolean = false,
  customPrompt?: string
): CachedSystemPrompt {
  const factsText =
    facts.length > 0 ? facts.map((f) => `- ${f}`).join("\n") : "No memories yet.";

  // Get current date/time in a readable format
  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const identity = customPrompt
    ? customPrompt
    : isVoice
      ? DEFAULT_VOICE_IDENTITY
      : DEFAULT_IDENTITY;

  const instructions = isVoice ? VOICE_INSTRUCTIONS : SYSTEM_INSTRUCTIONS;

  // Dynamic content that changes per request
  const dynamicContent = `
## Current Context:
- Date/Time: ${dateTimeStr}

## What You Remember About This User:
${factsText}`;

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
  customPrompt?: string
): string {
  const factsText =
    facts.length > 0 ? facts.map((f) => `- ${f}`).join("\n") : "No memories yet.";

  const now = new Date();
  const dateTimeStr = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const identity = customPrompt
    ? customPrompt
    : isVoice
      ? DEFAULT_VOICE_IDENTITY
      : DEFAULT_IDENTITY;

  const instructions = isVoice ? VOICE_INSTRUCTIONS : SYSTEM_INSTRUCTIONS;

  return `${identity}${instructions}

## Current Context:
- Date/Time: ${dateTimeStr}

## What You Remember About This User:
${factsText}`;
}
