import type { Config } from "./config.js";

export interface EntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface ServiceCallResult {
  success: boolean;
  states?: EntityState[];
}

export interface Area {
  area_id: string;
  name: string;
  picture: string | null;
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

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Create custom fetch options for self-signed certs
    const fetchOptions: RequestInit & { dispatcher?: unknown } = {
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
      fetchOptions.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false,
        },
      });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `HA API error: ${response.status} ${response.statusText} - ${text}`
      );
    }

    return response.json() as Promise<T>;
  }

  async checkConnection(): Promise<{ message: string }> {
    return this.request<{ message: string }>("/api/");
  }

  async getStates(): Promise<EntityState[]> {
    return this.request<EntityState[]>("/api/states");
  }

  async getState(entityId: string): Promise<EntityState> {
    return this.request<EntityState>(`/api/states/${entityId}`);
  }

  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>
  ): Promise<ServiceCallResult> {
    const states = await this.request<EntityState[]>(
      `/api/services/${domain}/${service}`,
      {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }
    );
    return { success: true, states };
  }

  async getHistory(
    entityId: string,
    startTime?: string,
    endTime?: string
  ): Promise<HistoryEntry[][]> {
    // Default to last 24 hours if no start time provided
    const start = startTime || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = endTime || new Date().toISOString();
    
    // HA history API returns array of arrays (one array per entity)
    // Format: /api/history/period/<start_time>?filter_entity_id=<entity_id>&end_time=<end_time>
    const params = new URLSearchParams({
      filter_entity_id: entityId,
      end_time: end,
    });
    
    const path = `/api/history/period/${start}?${params.toString()}`;
    return this.request<HistoryEntry[][]>(path);
  }

  async getAreas(): Promise<Area[]> {
    // Areas require websocket API, but we can use template endpoint
    // For now, return empty array - will implement in Phase 2
    return [];
  }

  async searchEntities(query: string): Promise<EntityState[]> {
    const states = await this.getStates();
    const lowerQuery = query.toLowerCase();
    return states.filter(
      (s) =>
        s.entity_id.toLowerCase().includes(lowerQuery) ||
        (s.attributes.friendly_name as string | undefined)
          ?.toLowerCase()
          .includes(lowerQuery)
    );
  }

  async getEntitiesByDomain(domain: string): Promise<EntityState[]> {
    const states = await this.getStates();
    return states.filter((s) => s.entity_id.startsWith(`${domain}.`));
  }
}
