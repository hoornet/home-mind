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

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class HomeAssistantClient {
  private baseUrl: string;
  private token: string;
  private skipTlsVerify: boolean;

  // Cache settings
  private cacheTTL: number = 10000; // 10 seconds default
  private allStatesCache: CacheEntry<EntityState[]> | null = null;
  private entityCache: Map<string, CacheEntry<EntityState>> = new Map();

  constructor(config: Config) {
    this.baseUrl = config.haUrl.replace(/\/$/, "");
    this.token = config.haToken;
    this.skipTlsVerify = config.haSkipTlsVerify;
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
    if (!entry) return false;
    return Date.now() - entry.timestamp < this.cacheTTL;
  }

  /**
   * Invalidate all caches (call after service calls)
   */
  private invalidateCache(): void {
    this.allStatesCache = null;
    this.entityCache.clear();
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
   * Get all states (cached)
   */
  private async getAllStatesCached(): Promise<EntityState[]> {
    if (this.isCacheValid(this.allStatesCache)) {
      return this.allStatesCache.data;
    }

    const states = await this.fetch<EntityState[]>("/api/states");
    this.allStatesCache = { data: states, timestamp: Date.now() };

    // Also populate individual entity cache
    for (const state of states) {
      this.entityCache.set(state.entity_id, { data: state, timestamp: Date.now() });
    }

    return states;
  }

  /**
   * Get state of a single entity (cached)
   */
  async getState(entityId: string): Promise<EntityState> {
    // Check individual cache first
    const cached = this.entityCache.get(entityId);
    if (this.isCacheValid(cached)) {
      return cached.data;
    }

    // Check if we have a recent all-states cache
    if (this.isCacheValid(this.allStatesCache)) {
      const state = this.allStatesCache.data.find(s => s.entity_id === entityId);
      if (state) return state;
    }

    // Fetch individual entity
    const state = await this.fetch<EntityState>(`/api/states/${entityId}`);
    this.entityCache.set(entityId, { data: state, timestamp: Date.now() });
    return state;
  }

  /**
   * Get all entities, optionally filtered by domain (cached)
   */
  async getEntities(domain?: string): Promise<EntityState[]> {
    const states = await this.getAllStatesCached();

    if (domain) {
      return states.filter((s) => s.entity_id.startsWith(`${domain}.`));
    }

    return states;
  }

  /**
   * Search entities by name or ID substring (cached)
   */
  async searchEntities(query: string): Promise<EntityState[]> {
    const states = await this.getAllStatesCached();
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
   * Call a Home Assistant service (invalidates cache)
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

    const result = await this.fetch<EntityState[]>(`/api/services/${domain}/${service}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    // Invalidate cache after service call since states may have changed
    this.invalidateCache();

    return result;
  }

  /**
   * Get historical states for an entity (not cached - historical data)
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
