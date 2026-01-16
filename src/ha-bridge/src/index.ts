import express from "express";
import { loadConfig } from "./config.js";
import { MemoryStore } from "./memory/store.js";
import { FactExtractor } from "./memory/extractor.js";
import { HomeAssistantClient } from "./ha/client.js";
import { LLMClient } from "./llm/client.js";
import { createRouter } from "./api/routes.js";
import { mkdirSync } from "fs";
import { dirname } from "path";

// Load configuration
const config = loadConfig();

// Ensure data directory exists
try {
  mkdirSync(dirname(config.dbPath), { recursive: true });
} catch {
  // Directory may already exist
}

// Initialize components
console.log("Initializing HA Bridge...");

const memory = new MemoryStore(config.dbPath);
console.log(`  Memory store: ${config.dbPath}`);

const extractor = new FactExtractor(config.anthropicApiKey);
console.log("  Fact extractor: Claude Haiku");

const ha = new HomeAssistantClient(config);
console.log(`  Home Assistant: ${config.haUrl}`);

const llm = new LLMClient(config, memory, extractor, ha);
console.log("  LLM client: Claude Sonnet 4");

// Create Express app
const app = express();
app.use(express.json());

// Add request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
});

// Mount API routes
app.use("/api", createRouter(llm, memory));

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "HA Bridge",
    version: "0.1.0",
    description:
      "Home Assistant Bridge API with memory for voice integration",
    endpoints: {
      chat: "POST /api/chat",
      memory: "GET /api/memory/:userId",
      health: "GET /api/health",
    },
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`
┌─────────────────────────────────────────┐
│          HA Bridge Started              │
├─────────────────────────────────────────┤
│  Port: ${config.port.toString().padEnd(33)}│
│  HA URL: ${config.haUrl.substring(0, 30).padEnd(30)}│
│  Log Level: ${config.logLevel.padEnd(27)}│
└─────────────────────────────────────────┘

Ready to accept requests at http://localhost:${config.port}
`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  memory.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  memory.close();
  process.exit(0);
});
