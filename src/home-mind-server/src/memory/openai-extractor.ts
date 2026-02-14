import OpenAI from "openai";
import type { ExtractedFact, Fact } from "./types.js";
import type { IFactExtractor } from "../llm/interface.js";
import { EXTRACTION_PROMPT, VALID_CATEGORIES } from "./extraction-prompt.js";

export class OpenAIFactExtractor implements IFactExtractor {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.client = new OpenAI({ apiKey, baseURL: baseUrl });
    this.model = model;
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
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const text = response.choices[0]?.message?.content ?? "";

      // Strip markdown code fences if present (LLMs sometimes wrap JSON in ```json ... ```)
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      const facts = JSON.parse(cleaned);

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
