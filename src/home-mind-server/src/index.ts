import "dotenv/config";
import express from "express";
import { loadConfig } from "./config.js";
import { ShodhMemoryStore } from "./memory/shodh-client.js";
import { FactExtractor } from "./memory/extractor.js";
import { HomeAssistantClient } from "./ha/client.js";
import { LLMClient } from "./llm/client.js";
import { createRouter } from "./api/routes.js";

// Load configuration
const config = loadConfig();

// Initialize components
console.log("Initializing Home Mind API...");

// Initialize Shodh memory store (required)
console.log(`  Connecting to Shodh Memory: ${config.shodhUrl}`);
const memory = new ShodhMemoryStore({
  baseUrl: config.shodhUrl,
  apiKey: config.shodhApiKey,
});

// Verify Shodh is available
const healthy = await memory.isHealthy();
if (!healthy) {
  console.error("ERROR: Shodh Memory is not available at", config.shodhUrl);
  console.error("Please ensure Shodh is running before starting Home Mind.");
  process.exit(1);
}
console.log("  ✓ Memory store: Shodh Memory (cognitive, semantic search)");

const extractor = new FactExtractor(config.anthropicApiKey);
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
app.use("/api", createRouter(llm, memory, "shodh"));

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "Home Mind Server",
    version: "0.5.0",
    description: "Home Assistant AI with cognitive memory for voice integration",
    memoryBackend: "shodh",
    endpoints: {
      chat: "POST /api/chat",
      chatStream: "POST /api/chat/stream",
      memory: "GET /api/memory/:userId",
      health: "GET /api/health",
    },
  });
});

// Start server
app.listen(config.port, () => {
  console.log(`
┌─────────────────────────────────────────┐
│      Home Mind Server Started           │
├─────────────────────────────────────────┤
│  Port: ${config.port.toString().padEnd(33)}│
│  Memory: Shodh (cognitive)              │
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
