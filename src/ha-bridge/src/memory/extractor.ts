import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFact } from "./types.js";

const EXTRACTION_PROMPT = `You are a memory extraction assistant for a smart home AI. Analyze this conversation and extract facts worth remembering about the user and their home.

Categories (use exactly these):
- baseline: Sensor normal values ("NOx 100ppm is normal for my home")
- preference: User preferences ("I prefer 22°C", "I like lights dim")
- identity: User info ("my name is Jure", "I'm also called Hoornet")
- device: Device nicknames ("call light.wled_kitchen the main kitchen light")
- pattern: Routines ("I usually get home by 6pm")
- correction: Corrections to previous knowledge ("actually X is normal, not Y")

Conversation:
User: {user_message}
Assistant: {assistant_response}

Return ONLY a JSON array of facts to remember. Each fact should be a complete, standalone statement that can be understood without context. Return empty array [] if no facts worth remembering.

Example outputs:
[{"content": "NOx sensor reading of 100ppm is normal in this home", "category": "baseline"}]
[{"content": "User's name is Jure, also known as Hoornet", "category": "identity"}]
[]

Important:
- Only extract SIGNIFICANT facts that should persist across sessions
- Don't extract temporary information or one-time queries
- Make facts self-contained and clear
- Return valid JSON only, no explanation`;

export class FactExtractor {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async extract(
    userMessage: string,
    assistantResponse: string
  ): Promise<ExtractedFact[]> {
    try {
      const prompt = EXTRACTION_PROMPT.replace(
        "{user_message}",
        userMessage
      ).replace("{assistant_response}", assistantResponse);

      const response = await this.client.messages.create({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const text =
        response.content[0].type === "text" ? response.content[0].text : "";

      // Parse JSON response
      const facts = JSON.parse(text);

      if (!Array.isArray(facts)) {
        return [];
      }

      // Validate structure
      return facts.filter(
        (f: any) =>
          typeof f.content === "string" &&
          typeof f.category === "string" &&
          [
            "baseline",
            "preference",
            "identity",
            "device",
            "pattern",
            "correction",
          ].includes(f.category)
      );
    } catch (error) {
      // Log but don't fail - extraction is best-effort
      console.error("Fact extraction failed:", error);
      return [];
    }
  }
}
