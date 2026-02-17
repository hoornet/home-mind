import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import type { IChatEngine } from "../llm/interface.js";
import type { IMemoryStore } from "../memory/interface.js";
import type { IConversationStore } from "../memory/types.js";
import type { ISttService } from "../stt/stt-service.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Request validation schemas
const ChatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  userId: z.string().default("default"),
  conversationId: z.string().optional(),
  isVoice: z.boolean().default(false),
  customPrompt: z.string().optional(),
});

const AddFactSchema = z.object({
  content: z.string().min(1, "Fact content is required"),
  category: z.enum([
    "baseline",
    "preference",
    "identity",
    "device",
    "pattern",
    "correction",
  ]),
});

export function createRouter(
  llm: IChatEngine,
  memory: IMemoryStore,
  memoryBackend: "sqlite" | "shodh" = "sqlite",
  version: string = "0.0.0",
  defaultCustomPrompt?: string,
  conversations?: IConversationStore,
  stt?: ISttService
): Router {
  const router = Router();

  /**
   * POST /api/chat
   * Main chat endpoint - send a message, get an AI response.
   * Uses streaming internally for faster processing, returns complete response.
   */
  router.post("/chat", async (req: Request, res: Response) => {
    try {
      const parsed = ChatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.errors,
        });
      }

      // Use streaming internally (no callback = just faster processing)
      const response = await llm.chat({
        ...parsed.data,
        customPrompt: parsed.data.customPrompt ?? defaultCustomPrompt,
      });
      res.json(response);
    } catch (error) {
      console.error("Chat error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/chat/stream
   * Streaming chat endpoint using Server-Sent Events (SSE).
   * Sends text chunks as they arrive, then final response.
   */
  router.post("/chat/stream", async (req: Request, res: Response) => {
    try {
      const parsed = ChatRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.errors,
        });
      }

      // Set up SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      // Stream chunks to client
      const response = await llm.chat({
        ...parsed.data,
        customPrompt: parsed.data.customPrompt ?? defaultCustomPrompt,
      }, (chunk: string) => {
        res.write(`event: chunk\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
      });

      // Send final complete response
      res.write(`event: done\ndata: ${JSON.stringify(response)}\n\n`);
      res.end();
    } catch (error) {
      console.error("Chat stream error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  });

  /**
   * GET /api/memory/:userId
   * Get all facts stored for a user
   */
  router.get("/memory/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const facts = await memory.getFacts(userId);
      res.json({
        userId,
        factCount: facts.length,
        facts,
      });
    } catch (error) {
      console.error("Memory fetch error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/memory/:userId/facts
   * Manually add a fact for a user
   */
  router.post("/memory/:userId/facts", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const parsed = AddFactSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid request",
          details: parsed.error.errors,
        });
      }

      const { content, category } = parsed.data;
      const id = await memory.addFactIfNew(userId, content, category);

      if (id) {
        res.status(201).json({ id, message: "Fact added" });
      } else {
        res.status(200).json({ message: "Fact already exists" });
      }
    } catch (error) {
      console.error("Add fact error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/memory/:userId
   * Clear all facts for a user
   */
  router.delete("/memory/:userId", async (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const deleted = await memory.clearUserFacts(userId);
      res.json({
        message: `Cleared ${deleted} facts for user ${userId}`,
        deleted,
      });
    } catch (error) {
      console.error("Clear memory error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/memory/:userId/facts/:factId
   * Delete a specific fact
   */
  router.delete(
    "/memory/:userId/facts/:factId",
    async (req: Request, res: Response) => {
      try {
        const userId = req.params.userId as string;
        const factId = req.params.factId as string;
        const deleted = await memory.deleteFact(userId, factId);

        if (deleted) {
          res.json({ message: "Fact deleted" });
        } else {
          res.status(404).json({ error: "Fact not found" });
        }
      } catch (error) {
        console.error("Delete fact error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        res.status(500).json({ error: message });
      }
    }
  );

  /**
   * GET /api/conversations/:userId
   * List all conversations for a user
   */
  router.get("/conversations/:userId", async (req: Request, res: Response) => {
    if (!conversations) {
      return res.status(501).json({ error: "Conversation store not available" });
    }

    try {
      const userId = req.params.userId as string;
      const list = await conversations.listConversations(userId);
      res.json(list);
    } catch (error) {
      console.error("List conversations error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/conversations/:userId/:conversationId
   * Get full conversation history
   */
  router.get("/conversations/:userId/:conversationId", async (req: Request, res: Response) => {
    if (!conversations) {
      return res.status(501).json({ error: "Conversation store not available" });
    }

    try {
      const conversationId = req.params.conversationId as string;
      const messages = await conversations.getConversationHistory(conversationId, 20);
      res.json({ conversationId, messages });
    } catch (error) {
      console.error("Get conversation error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * DELETE /api/conversations/:userId/:conversationId
   * Delete a conversation
   */
  router.delete("/conversations/:userId/:conversationId", async (req: Request, res: Response) => {
    if (!conversations) {
      return res.status(501).json({ error: "Conversation store not available" });
    }

    try {
      const conversationId = req.params.conversationId as string;
      const deleted = await conversations.deleteConversation(conversationId);

      if (deleted > 0) {
        res.json({ message: `Deleted ${deleted} messages`, deleted });
      } else {
        res.status(404).json({ error: "Conversation not found" });
      }
    } catch (error) {
      console.error("Delete conversation error:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  /**
   * POST /api/stt
   * Transcribe audio to text using Whisper (HomeMind App only).
   * Accepts multipart/form-data with an "audio" field.
   * Returns 501 when STT_PROVIDER is not configured.
   */
  router.post("/stt", upload.single("audio"), async (req: Request, res: Response) => {
    if (!stt) {
      return res.status(501).json({ error: "STT is not enabled on this server" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No audio file provided (field name: audio)" });
    }

    try {
      const { buffer, mimetype, originalname } = req.file;
      const text = await stt.transcribe(buffer, mimetype, originalname || "audio.webm");
      res.json({ text });
    } catch (error) {
      console.error("STT error:", error);
      const message = error instanceof Error ? error.message : "Transcription failed";
      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /api/health
   * Health check endpoint
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version,
      memoryBackend,
    });
  });

  return router;
}
