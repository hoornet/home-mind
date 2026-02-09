import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFact, Fact } from "./types.js";
import type { IFactExtractor } from "../llm/interface.js";
import { EXTRACTION_PROMPT, VALID_CATEGORIES } from "./extraction-prompt.js";

export class FactExtractor implements IFactExtractor {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model: string = "claude-haiku-4-5-20251001") {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async extract(
    userMessage: string,
    assistantResponse: string,
    existingFacts: Fact[] = []
  ): Promise<ExtractedFact[]> {
    try {
      // Build existing facts section for the prompt
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

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Strip markdown code fences if present (LLMs sometimes wrap JSON in ```json ... ```)
      const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

      // Parse JSON response
      const facts = JSON.parse(cleaned);

      if (!Array.isArray(facts)) {
        return [];
      }

      // Validate structure
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
          replaces: Array.isArray(f.replaces) ? f.replaces : [],
        }));
    } catch (error) {
      // Log but don't fail - extraction is best-effort
      console.error("Fact extraction failed:", error);
      return [];
    }
  }
}
