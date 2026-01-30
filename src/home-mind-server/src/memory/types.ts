export type FactCategory =
  | "baseline" // Sensor normal values ("NOx 100ppm is normal")
  | "preference" // User preferences ("prefers 22°C")
  | "identity" // User info ("name is Jure")
  | "device" // Device nicknames ("main light = light.wled_kitchen")
  | "pattern" // Routines ("usually home by 6pm")
  | "correction"; // Corrections ("actually X, not Y")

export interface Fact {
  id: string;
  userId: string;
  content: string;
  category: FactCategory;
  confidence: number;
  createdAt: Date;
  lastUsed: Date;
  useCount: number;
}

export interface ExtractedFact {
  content: string;
  category: FactCategory;
  replaces?: string[]; // IDs of existing facts this one supersedes
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}
