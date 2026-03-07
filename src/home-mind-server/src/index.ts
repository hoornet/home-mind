import "dotenv/config";
import express from "express";
import cors from "cors";
import { createRequire } from "module";
import { loadConfig } from "./config.js";
import { createAuthMiddleware } from "./api/auth.js";

// Read version from package.json
const require = createRequire(import.meta.url);
const { version } = require("../package.json");
import { ShodhMemoryStore } from "./memory/shodh-client.js";
import { createConversationStore } from "./memory/conversation-factory.js";
import { HomeAssistantClient } from "./ha/client.js";
import { DeviceScanner } from "./ha/device-scanner.js";
import { TopologyScanner } from "./ha/topology-scanner.js";
import { createChatEngine, createFactExtractor } from "./llm/factory.js";
import { createRouter } from "./api/routes.js";
import { createSttService } from "./stt/stt-service.js";
import { createTtsService } from "./tts/tts-service.js";
import { MemoryCleanupJob } from "./jobs/memory-cleanup.js";

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

// Initialize conversation store
const conversations = createConversationStore(config);
console.log(`  ✓ Conversation store: ${config.conversationStorage}`);

const extractor = createFactExtractor(config);
console.log(`  Fact extractor: ${config.llmProvider}/${config.llmModel}`);

const ha = new HomeAssistantClient(config);
console.log(`  Home Assistant: ${config.haUrl}`);

let deviceOverrides = {};
if (config.deviceOverrides) {
  try {
    deviceOverrides = JSON.parse(config.deviceOverrides);
  } catch {
    console.warn("  ⚠ DEVICE_OVERRIDES is not valid JSON — ignored");
  }
}
const scanner = new DeviceScanner(ha, 30 * 60 * 1000, deviceOverrides);
const topology = new TopologyScanner(ha, 30 * 60 * 1000);
await Promise.all([scanner.scan(), topology.scan()]);
console.log(`  ✓ Device scanner: ${scanner.getProfiles().length} light profiles loaded`);
console.log(`  ✓ Topology scanner: home layout ${topology.hasLayout() ? "loaded" : "unavailable"}`);

const llm = createChatEngine(config, memory, conversations, extractor, ha, scanner, topology);
console.log(`  LLM client: ${config.llmProvider}/${config.llmModel}`);

// Initialize STT (optional — only when STT_PROVIDER is set)
const stt = createSttService(config);
if (stt) {
  console.log(`  STT: ${config.sttProvider} / ${config.sttModel}`);
} else {
  console.log("  STT: disabled");
}

// Initialize TTS (optional — only when TTS_PROVIDER is set)
const tts = createTtsService(config);
if (tts) {
  console.log(`  TTS: ${config.ttsProvider} / ${config.ttsModel} (voice: ${config.ttsVoice})`);
} else {
  console.log("  TTS: disabled");
}

// Create Express app
const app = express();

// CORS middleware (only when CORS_ORIGINS is configured)
if (config.corsOrigins) {
  const origins = config.corsOrigins.split(",").map((o) => o.trim());
  app.use(cors({ origin: origins, credentials: true }));
  console.log(`  CORS: ${origins.join(", ")}`);
}

app.use(express.json());

// API token auth (only when API_TOKEN is configured)
const authMiddleware = createAuthMiddleware(config.apiToken);
app.use("/api", authMiddleware);

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
app.use("/api", createRouter(llm, memory, "shodh", version, config.customPrompt, conversations, stt ?? undefined, tts ?? undefined));

// Root endpoint
app.get("/", (_req, res) => {
  res.json({
    name: "Home Mind Server",
    version,
    description: "Home Assistant AI with cognitive memory for voice integration",
    memoryBackend: "shodh",
    conversationStorage: config.conversationStorage,
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
│  LLM: ${(config.llmProvider + "/" + config.llmModel).substring(0, 32).padEnd(32)}│
│  Memory: Shodh (cognitive)              │
│  Conversations: ${config.conversationStorage.padEnd(23)}│
│  HA URL: ${config.haUrl.substring(0, 30).padEnd(30)}│
│  Log Level: ${config.logLevel.padEnd(27)}│
└─────────────────────────────────────────┘

Ready to accept requests at http://localhost:${config.port}
`);
});

// Start periodic memory cleanup
const cleanupJob = new MemoryCleanupJob(memory, conversations, config.memoryCleanupIntervalHours);
cleanupJob.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  cleanupJob.stop();
  conversations.close();
  memory.close();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  cleanupJob.stop();
  conversations.close();
  memory.close();
  process.exit(0);
});
