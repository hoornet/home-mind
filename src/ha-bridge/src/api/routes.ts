import { Router, Request, Response } from "express";
import { z } from "zod";
import type { LLMClient } from "../llm/client.js";
import type { MemoryStore } from "../memory/store.js";

// Request validation schemas
const ChatRequestSchema = z.object({
  message: z.string().min(1, "Message is required"),
  userId: z.string().default("default"),
  conversationId: z.string().optional(),
  isVoice: z.boolean().default(false),
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

export function createRouter(llm: LLMClient, memory: MemoryStore): Router {
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
      const response = await llm.chat(parsed.data);
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
      const response = await llm.chat(parsed.data, (chunk: string) => {
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
  router.get("/memory/:userId", (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const facts = memory.getFacts(userId);
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
  router.post("/memory/:userId/facts", (req: Request, res: Response) => {
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
      const id = memory.addFactIfNew(userId, content, category);

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
  router.delete("/memory/:userId", (req: Request, res: Response) => {
    try {
      const userId = req.params.userId as string;
      const deleted = memory.clearUserFacts(userId);
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
    (req: Request, res: Response) => {
      try {
        const factId = req.params.factId as string;
        const deleted = memory.deleteFact(factId);

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
   * GET /api/health
   * Health check endpoint
   */
  router.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "0.3.0",
    });
  });

  return router;
}
