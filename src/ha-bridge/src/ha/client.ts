import type { Config } from "../config.js";

export interface EntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HistoryEntry {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export class HomeAssistantClient {
  private baseUrl: string;
  private token: string;
  private skipTlsVerify: boolean;

  constructor(config: Config) {
    this.baseUrl = config.haUrl.replace(/\/$/, "");
    this.token = config.haToken;
    this.skipTlsVerify = config.haSkipTlsVerify;
  }

  private async fetch<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    };

    // Handle self-signed certificates
    if (this.skipTlsVerify && url.startsWith("https://")) {
      const { Agent } = await import("undici");
      (fetchOptions as any).dispatcher = new Agent({
        connect: { rejectUnauthorized: false },
      });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HA API error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get state of a single entity
   */
  async getState(entityId: string): Promise<EntityState> {
    return this.fetch<EntityState>(`/api/states/${entityId}`);
  }

  /**
   * Get all entities, optionally filtered by domain
   */
  async getEntities(domain?: string): Promise<EntityState[]> {
    const states = await this.fetch<EntityState[]>("/api/states");

    if (domain) {
      return states.filter((s) => s.entity_id.startsWith(`${domain}.`));
    }

    return states;
  }

  /**
   * Search entities by name or ID substring
   */
  async searchEntities(query: string): Promise<EntityState[]> {
    const states = await this.fetch<EntityState[]>("/api/states");
    const lowerQuery = query.toLowerCase();

    return states.filter((s) => {
      const name = (s.attributes.friendly_name as string) || "";
      return (
        s.entity_id.toLowerCase().includes(lowerQuery) ||
        name.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Call a Home Assistant service
   */
  async callService(
    domain: string,
    service: string,
    entityId?: string,
    data?: Record<string, unknown>
  ): Promise<EntityState[]> {
    const payload: Record<string, unknown> = { ...data };
    if (entityId) {
      payload.entity_id = entityId;
    }

    return this.fetch<EntityState[]>(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get historical states for an entity
   */
  async getHistory(
    entityId: string,
    startTime?: string,
    endTime?: string
  ): Promise<HistoryEntry[]> {
    const start = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let endpoint = `/api/history/period/${start}?filter_entity_id=${entityId}`;

    if (endTime) {
      endpoint += `&end_time=${endTime}`;
    }

    const result = await this.fetch<HistoryEntry[][]>(endpoint);
    return result[0] || [];
  }
}
