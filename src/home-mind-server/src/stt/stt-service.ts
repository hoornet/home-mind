/**
 * Speech-to-text service.
 * Currently only the OpenAI Whisper API is supported.
 * When STT_PROVIDER is not set (or "none"), the service is disabled
 * and the /api/stt endpoint returns 501.
 */

import OpenAI from "openai";
import type { Config } from "../config.js";

export interface ISttService {
  transcribe(audioBuffer: Buffer, mimeType: string, filename: string): Promise<string>;
}

export class OpenAISttService implements ISttService {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    this.model = model;
  }

  async transcribe(audioBuffer: Buffer, mimeType: string, filename: string): Promise<string> {
    const file = new File([audioBuffer], filename, { type: mimeType });
    const result = await this.client.audio.transcriptions.create({
      file,
      model: this.model,
    });
    return result.text;
  }
}

export function createSttService(config: Config): ISttService | null {
  if (config.sttProvider === "none") return null;

  // Resolve API key: dedicated STT key takes precedence, then fall back to openaiApiKey
  const apiKey = config.sttApiKey ?? config.openaiApiKey;
  if (!apiKey) return null;

  return new OpenAISttService(apiKey, config.sttModel, config.sttBaseUrl ?? config.openaiBaseUrl);
}
