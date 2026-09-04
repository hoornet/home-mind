import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "get_state",
    description:
      "Get the current state of a Home Assistant entity (sensor, light, switch, etc.)",
    parameters: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description:
            "The entity ID to get state for (e.g., sensor.temperature, light.living_room)",
        },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "get_entities",
    description:
      "List all Home Assistant entities, optionally filtered by domain (light, sensor, switch, etc.)",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description:
            "Optional domain to filter by (e.g., 'light', 'sensor', 'switch')",
        },
      },
      required: [],
    },
  },
  {
    name: "search_entities",
    description:
      "Search for Home Assistant entities by name or ID substring. Returns entity IDs, states, and attributes. Use this to find the correct entity_id before calling call_service.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to match against entity IDs and names",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "call_service",
    description:
      "Call a Home Assistant service to control devices (turn on/off lights, set thermostat, etc.). " +
      "Services that return data (weather.get_forecasts, calendar.get_events, todo.get_items, ...) " +
      "work too: their result comes back in `service_response`, with no extra flag needed. " +
      "FORECASTS: weather entities do NOT carry a forecast in their attributes. For tomorrow's " +
      "weather, rain, or any forecast, call weather.get_forecasts with entity_id set to the weather " +
      "entity and data {\"type\": \"daily\"} (or \"hourly\"), then read service_response.",
    parameters: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Service domain (e.g., 'light', 'switch', 'climate')",
        },
        service: {
          type: "string",
          description:
            "Service name (e.g., 'turn_on', 'turn_off', 'toggle'). For lights: use 'turn_on' with data to set brightness/color — there is no separate 'set_color' service.",
        },
        entity_id: {
          type: "string",
          description: "Optional entity ID to target",
        },
        data: {
          type: "object",
          description:
            "Optional service data. Common fields for light.turn_on: brightness (0-255), rgb_color ([R,G,B] each 0-255), color_temp_kelvin (2000-6500, e.g. 2700=warm white, 4000=neutral, 6500=daylight), hs_color ([hue 0-360, saturation 0-100]), rgbw_color ([R,G,B,W] each 0-255, for RGBW strips). WHITE LIGHT — check supported_color_modes first: if 'rgbw' use rgbw_color [0,0,0,255]; if only 'color_temp' use color_temp_kelvin; if 'xy'/'hs'/'rgb' (RGB-only lights) use rgb_color [255,255,255]. Do NOT invent fields like 'white' or 'color'.",
        },
      },
      required: ["domain", "service"],
    },
  },
  {
    name: "get_history",
    description:
      "Historical states for one entity, for trend analysis. ALWAYS check the " +
      "`kind` field before reading the result, which is one of exactly three shapes. " +
      'kind="raw": `points` holds every reading as {state, last_changed}. ' +
      'kind="numeric": `buckets` holds {t, n, min, max, mean} per interval, where ' +
      "`t` is the start of the interval, `bucket_minutes` is its length, and `n` is " +
      "how many readings fell in it. A short spike appears as a high `max` in one " +
      "bucket while `mean` stays near normal. " +
      'kind="state": `buckets` holds {t, n, state, changes}, where `state` is the ' +
      "value held for most of the interval and `changes` counts transitions within it. " +
      "Long ranges are ALWAYS returned as buckets and the individual readings are NOT " +
      "available for them. To examine something more closely, call again with a " +
      "narrower start_time and end_time, which yields smaller buckets or raw readings.",
    parameters: {
      type: "object",
      properties: {
        entity_id: {
          type: "string",
          description: "The entity ID to get history for",
        },
        start_time: {
          type: "string",
          description:
            "Start time in ISO 8601 format with timezone (e.g., '2026-01-15T20:00:00Z'). Use the ISO Timestamp from system context for calculations. Default: 24 hours ago.",
        },
        end_time: {
          type: "string",
          description:
            "End time in ISO 8601 format with timezone (e.g., '2026-01-15T21:00:00Z'). Use the ISO Timestamp from system context for calculations. Default: now.",
        },
      },
      required: ["entity_id"],
    },
  },
  {
    name: "forget_memory",
    description:
      "Permanently forget ONE stored memory about the user. Use when the user asks you to forget, delete, or stop remembering a specific thing ('forget that…', 'delete the memory that…', 'that's no longer true'). Set 'query' to the EXACT text of the remembered fact as it appears in 'What You Remember About This User' — copied verbatim, never paraphrased and never translated. The FIRST call NEVER deletes anything: it returns a 'confirmation_required' preview quoting the memory, and relaying that preview IS how you ask the user. Only after the user agrees in their NEXT message do you call this again with the same query to actually forget it. One specific memory per call — NEVER loop it to wipe memories the user did not name. 'Don't forget to X' is a request to REMEMBER or remind, never a reason to call this tool. Your own name and personality are NOT memories and cannot be changed with this tool. Deletion is permanent.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The exact text of the remembered fact to forget, copied verbatim from 'What You Remember About This User' (or from a candidate returned by an earlier call).",
        },
      },
      required: ["query"],
    },
  },
];

export function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: {
      type: "object" as const,
      properties: t.parameters.properties,
      required: t.parameters.required,
    },
  }));
}

export function toOpenAITools(
  tools: ToolDefinition[]
): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
