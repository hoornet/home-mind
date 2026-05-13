import OpenAI from "openai";
import type { ExtractedFact, Fact } from "./types.js";
import type { IFactExtractor } from "../llm/interface.js";
import { EXTRACTION_PROMPT, VALID_CATEGORIES } from "./extraction-prompt.js";

export class OpenAIFactExtractor implements IFactExtractor {
  private client: OpenAI;
  private model: string;
  private responseFormat: "json_object" | undefined;
  private maxTokens: number;

  constructor(
    apiKey: string,
    model: string,
    baseUrl?: string,
    responseFormat?: "json_object",
    maxTokens?: number
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      defaultHeaders: {
        "HTTP-Referer": "https://homemind.veganostr.com",
        "X-Title": "HomeMind PRO",
      },
    });
    this.model = model;
    this.responseFormat = responseFormat;
    this.maxTokens = maxTokens ?? 1000;
  }

  async extract(
    userMessage: string,
    assistantResponse: string,
    existingFacts: Fact[] = []
  ): Promise<ExtractedFact[]> {
    try {
      let existingFactsSection = "";
      if (existingFacts.length > 0) {
        const factsJson = existingFacts.map((f) => ({
          id: f.id,
          content: f.content,
          category: f.category,
        }));
        existingFactsSection = `Existing facts (check if new facts should replace any of these):
${JSON.stringify(factsJson, null, 2)}`;
      } else {
        existingFactsSection = "No existing facts stored yet.";
      }

      const prompt = EXTRACTION_PROMPT.replace(
        "{existing_facts_section}",
        existingFactsSection
      )
        .replace("{user_message}", userMessage)
        .replace("{assistant_response}", assistantResponse);

      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [{ role: "user", content: prompt }],
        ...(this.responseFormat
          ? { response_format: { type: this.responseFormat } }
          : {}),
      });

      const text = response.choices[0]?.message?.content ?? "";

      // Strip reasoning-model <think>...</think> blocks (Qwen3, DeepSeek-R1, etc.)
      // then markdown code fences (LLMs sometimes wrap JSON in ```json ... ```)
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .trim()
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      if (!cleaned) {
        console.warn(
          "Fact extractor returned empty content (possibly thinking-mode token cap). Try raising max_tokens or using a non-reasoning model."
        );
        return [];
      }

      // Some models (qwen3.6:27b, gpt-4o-mini, etc.) append trailing text after
      // the JSON or return a single object instead of an array. Strict
      // JSON.parse + Array.isArray would silently lose every fact in those cases.
      let facts: unknown;
      try {
        const parsed = JSON.parse(cleaned);
        facts = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
        if (!arrayMatch) {
          console.warn(
            `Fact extractor: response not valid JSON and no array found. Raw: ${cleaned.slice(0, 200)}`
          );
          return [];
        }
        try {
          facts = JSON.parse(arrayMatch[0]);
        } catch {
          console.warn(
            `Fact extractor: regex-extracted JSON slice also failed to parse. Raw: ${cleaned.slice(0, 200)}`
          );
          return [];
        }
      }

      if (!Array.isArray(facts)) {
        return [];
      }

      return facts
        .filter(
          (f: any) =>
            typeof f.content === "string" &&
            typeof f.category === "string" &&
            (VALID_CATEGORIES as readonly string[]).includes(f.category)
        )
        .map((f: any) => ({
          content: f.content,
          category: f.category,
          confidence: typeof f.confidence === "number" ? f.confidence : undefined,
          replaces: Array.isArray(f.replaces) ? f.replaces : [],
        }));
    } catch (error) {
      console.error("Fact extraction failed:", error);
      return [];
    }
  }
}
