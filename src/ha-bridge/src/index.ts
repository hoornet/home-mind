import "dotenv/config";
import express from "express";
import { loadConfig } from "./config.js";
import { MemoryStore } from "./memory/store.js";
import { ShodhMemoryStore } from "./memory/shodh-client.js";
import type { IMemoryStore } from "./memory/interface.js";
import { FactExtractor } from "./memory/extractor.js";
import { HomeAssistantClient } from "./ha/client.js";
import { LLMClient } from "./llm/client.js";
import { createRouter } from "./api/routes.js";
import { mkdirSync } from "fs";
import { dirname } from "path";

// Load configuration
const config = loadConfig();

// Ensure data directory exists (for SQLite fallback)
try {
  mkdirSync(dirname(config.dbPath), { recursive: true });
} catch {
  // Directory may already exist
}

// Initialize components
console.log("Initializing Home Mind API...");

// Initialize memory store - try Shodh first if configured, fall back to SQLite
let memory: IMemoryStore;
let usingShodh = false;

if (config.shodhEnabled && config.shodhUrl && config.shodhApiKey) {
  console.log(`  Attempting Shodh Memory: ${config.shodhUrl}`);
  const shodhMemory = new ShodhMemoryStore({
    baseUrl: config.shodhUrl,
    apiKey: config.shodhApiKey,
  });

  // Check if Shodh is healthy
  const healthy = await shodhMemory.isHealthy();
  if (healthy) {
    memory = shodhMemory;
    usingShodh = true;
    console.log("  ✓ Memory store: Shodh Memory (cognitive, semantic search)");
  } else {
    console.log("  ✗ Shodh not available, falling back to SQLite");
    memory = new MemoryStore(config.dbPath);
    console.log(`  Memory store: SQLite (${config.dbPath})`);
  }
} else {
  memory = new MemoryStore(config.dbPath);
  console.log(`  Memory store: SQLite (${config.dbPath})`);
}

const extractor = new FactExtractor(config.anthropicApiKey);
// Note: With Shodh, we could potentially skip Haiku extraction since Shodh
// has built-in entity extraction. For now, we keep Haiku for compatibility.
console.log("  Fact extractor: Claude Haiku");

const ha = new HomeAssistantClient(config);
console.log(`  Home Assistant: ${config.haUrl}`);

const llm = new LLMClient(config, memory, extractor, ha);
console.log("  LLM client: Claude Haiku 4.5");

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
app.use("/api", createRouter(llm, memory, usingShodh ? "shodh" : "sqlite"));

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "Home Mind API",
    version: "0.4.0",
    description:
      "Home Assistant AI with cognitive memory for voice integration",
    memoryBackend: usingShodh ? "shodh" : "sqlite",
    endpoints: {
      chat: "POST /api/chat",
      chatStream: "POST /api/chat/stream",
      memory: "GET /api/memory/:userId",
      health: "GET /api/health",
    },
  });
});

// Start server
const memoryType = usingShodh ? "Shodh (cognitive)" : "SQLite";
app.listen(config.port, () => {
  console.log(`
┌─────────────────────────────────────────┐
│        Home Mind API Started            │
├─────────────────────────────────────────┤
│  Port: ${config.port.toString().padEnd(33)}│
│  Memory: ${memoryType.padEnd(31)}│
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
