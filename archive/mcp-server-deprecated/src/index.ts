#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { HomeAssistantClient } from "./ha-client.js";

// Tool parameter schemas
const GetStateSchema = z.object({
  entity_id: z.string().describe("The entity ID to get state for (e.g., light.kitchen)"),
});

const GetEntitiesSchema = z.object({
  domain: z
    .string()
    .optional()
    .describe("Filter by domain (e.g., light, switch, sensor)"),
});

const SearchEntitiesSchema = z.object({
  query: z.string().describe("Search query to find entities by name or ID"),
});

const CallServiceSchema = z.object({
  domain: z.string().describe("Service domain (e.g., light, switch, climate)"),
  service: z.string().describe("Service name (e.g., turn_on, turn_off, toggle)"),
  entity_id: z.string().optional().describe("Target entity ID"),
  data: z
    .record(z.unknown())
    .optional()
    .describe("Additional service data (e.g., brightness, temperature)"),
});

const GetHistorySchema = z.object({
  entity_id: z.string().describe("The entity ID to get history for (e.g., sensor.temperature)"),
  start_time: z
    .string()
    .optional()
    .describe("ISO 8601 timestamp for start of history (default: 24 hours ago)"),
  end_time: z
    .string()
    .optional()
    .describe("ISO 8601 timestamp for end of history (default: now)"),
});

async function main() {
  const config = loadConfig();
  const haClient = new HomeAssistantClient(config);

  // Verify HA connection
  try {
    const status = await haClient.checkConnection();
    console.error(`Connected to Home Assistant: ${status.message}`);
  } catch (error) {
    console.error(`Failed to connect to Home Assistant: ${error}`);
    process.exit(1);
  }

  const server = new Server(
    {
      name: "homeassistant",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_state",
          description:
            "Get the current state of a Home Assistant entity (device, sensor, etc.)",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: {
                type: "string",
                description:
                  "The entity ID to get state for (e.g., light.kitchen, sensor.temperature)",
              },
            },
            required: ["entity_id"],
          },
        },
        {
          name: "get_entities",
          description:
            "List all Home Assistant entities, optionally filtered by domain",
          inputSchema: {
            type: "object",
            properties: {
              domain: {
                type: "string",
                description:
                  "Filter by domain (e.g., light, switch, sensor, climate)",
              },
            },
          },
        },
        {
          name: "search_entities",
          description: "Search for entities by name or ID",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query to find entities",
              },
            },
            required: ["query"],
          },
        },
        {
          name: "call_service",
          description:
            "Call a Home Assistant service to control devices (turn on/off, set values, etc.)",
          inputSchema: {
            type: "object",
            properties: {
              domain: {
                type: "string",
                description: "Service domain (e.g., light, switch, climate)",
              },
              service: {
                type: "string",
                description: "Service name (e.g., turn_on, turn_off, toggle)",
              },
              entity_id: {
                type: "string",
                description: "Target entity ID",
              },
              data: {
                type: "object",
                description:
                  "Additional service data (e.g., brightness, temperature)",
              },
            },
            required: ["domain", "service"],
          },
        },
        {
          name: "get_history",
          description:
            "Get historical state data for a sensor or entity over a time period",
          inputSchema: {
            type: "object",
            properties: {
              entity_id: {
                type: "string",
                description: "The entity ID to get history for (e.g., sensor.temperature)",
              },
              start_time: {
                type: "string",
                description:
                  "ISO 8601 timestamp for start of history (default: 24 hours ago). Example: 2026-01-16T08:00:00Z",
              },
              end_time: {
                type: "string",
                description:
                  "ISO 8601 timestamp for end of history (default: now). Example: 2026-01-16T20:00:00Z",
              },
            },
            required: ["entity_id"],
          },
        },
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "get_state": {
          const { entity_id } = GetStateSchema.parse(args);
          const state = await haClient.getState(entity_id);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    entity_id: state.entity_id,
                    state: state.state,
                    attributes: state.attributes,
                    last_changed: state.last_changed,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "get_entities": {
          const { domain } = GetEntitiesSchema.parse(args);
          const entities = domain
            ? await haClient.getEntitiesByDomain(domain)
            : await haClient.getStates();

          const summary = entities.map((e) => ({
            entity_id: e.entity_id,
            state: e.state,
            friendly_name: e.attributes.friendly_name,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summary, null, 2),
              },
            ],
          };
        }

        case "search_entities": {
          const { query } = SearchEntitiesSchema.parse(args);
          const entities = await haClient.searchEntities(query);

          const summary = entities.map((e) => ({
            entity_id: e.entity_id,
            state: e.state,
            friendly_name: e.attributes.friendly_name,
          }));

          return {
            content: [
              {
                type: "text",
                text:
                  summary.length > 0
                    ? JSON.stringify(summary, null, 2)
                    : `No entities found matching "${query}"`,
              },
            ],
          };
        }

        case "call_service": {
          const { domain, service, entity_id, data } =
            CallServiceSchema.parse(args);

          const serviceData: Record<string, unknown> = { ...data };
          if (entity_id) {
            serviceData.entity_id = entity_id;
          }

          const result = await haClient.callService(domain, service, serviceData);

          return {
            content: [
              {
                type: "text",
                text: result.success
                  ? `Service ${domain}.${service} called successfully${entity_id ? ` on ${entity_id}` : ""}`
                  : "Service call failed",
              },
            ],
          };
        }

        case "get_history": {
          const { entity_id, start_time, end_time } = GetHistorySchema.parse(args);
          const history = await haClient.getHistory(entity_id, start_time, end_time);

          // HA returns array of arrays, we want the first array (for our entity)
          const entityHistory = history[0] || [];

          if (entityHistory.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No history data found for ${entity_id} in the specified time range.`,
                },
              ],
            };
          }

          // Format the history for better readability
          const formatted = entityHistory.map((entry) => ({
            time: entry.last_changed,
            state: entry.state,
            // Include relevant attributes (e.g., unit_of_measurement for sensors)
            unit: entry.attributes.unit_of_measurement,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    entity_id,
                    data_points: formatted.length,
                    start: formatted[0]?.time,
                    end: formatted[formatted.length - 1]?.time,
                    history: formatted,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Home Assistant MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
