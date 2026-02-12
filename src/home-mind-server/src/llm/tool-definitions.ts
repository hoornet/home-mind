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
      "Call a Home Assistant service to control devices (turn on/off lights, set thermostat, etc.)",
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
            "Optional service data. Common fields for light.turn_on: brightness (0-255), rgb_color ([R,G,B] each 0-255), color_temp_kelvin (2000-6500, e.g. 2700=warm white, 4000=neutral, 6500=daylight), hs_color ([hue 0-360, saturation 0-100]), rgbw_color ([R,G,B,W] each 0-255, for RGBW LED strips). For white light: check supported_color_modes in entity attributes — if 'rgbw' is listed, use rgbw_color [0,0,0,255] (dedicated white channel); otherwise use color_temp_kelvin. Do NOT invent fields like 'white' or 'color'.",
        },
      },
      required: ["domain", "service"],
    },
  },
  {
    name: "get_history",
    description:
      "Get historical states for an entity over time (for trend analysis)",
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
