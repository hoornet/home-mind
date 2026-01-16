import type Anthropic from "@anthropic-ai/sdk";

export const HA_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_state",
    description:
      "Get the current state of a Home Assistant entity (sensor, light, switch, etc.)",
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
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
    description: "Search for Home Assistant entities by name or ID substring",
    input_schema: {
      type: "object" as const,
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
    input_schema: {
      type: "object" as const,
      properties: {
        domain: {
          type: "string",
          description: "Service domain (e.g., 'light', 'switch', 'climate')",
        },
        service: {
          type: "string",
          description: "Service name (e.g., 'turn_on', 'turn_off', 'toggle')",
        },
        entity_id: {
          type: "string",
          description: "Optional entity ID to target",
        },
        data: {
          type: "object",
          description: "Optional additional service data",
        },
      },
      required: ["domain", "service"],
    },
  },
  {
    name: "get_history",
    description:
      "Get historical states for an entity over time (for trend analysis)",
    input_schema: {
      type: "object" as const,
      properties: {
        entity_id: {
          type: "string",
          description: "The entity ID to get history for",
        },
        start_time: {
          type: "string",
          description:
            "Start time in ISO 8601 format (default: 24 hours ago)",
        },
        end_time: {
          type: "string",
          description: "End time in ISO 8601 format (default: now)",
        },
      },
      required: ["entity_id"],
    },
  },
];
