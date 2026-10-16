import { describe, it, expect, vi } from "vitest";
import { AssistExposure } from "./exposure.js";

const set = (...ids: string[]) => new Set(ids);

describe("AssistExposure", () => {
  it("allows an exposed entity and refuses one that is merely present", async () => {
    const exposure = new AssistExposure(async () => set("light.kitchen"));

    expect(await exposure.allows("light.kitchen")).toBe(true);
    expect(await exposure.allows("light.kitchen_1")).toBe(false);
  });

  it("has no opinion when the list cannot be read", async () => {
    const exposure = new AssistExposure(async () => null);

    // A websocket failure must not blind the assistant to the whole house.
    expect(await exposure.allows("light.anything")).toBe(true);
    expect(await exposure.list()).toBeNull();
  });

  it("has no opinion when the user exposed nothing", async () => {
    const exposure = new AssistExposure(async () => set());

    expect(await exposure.allows("light.anything")).toBe(true);
  });

  it("caches for the TTL, then refreshes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let current = set("light.a");
    const fetcher = vi.fn(async () => current);
    const exposure = new AssistExposure(fetcher, 1000);

    expect(await exposure.allows("light.a")).toBe(true);
    expect(await exposure.allows("light.b")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    current = set("light.a", "light.b");
    expect(await exposure.allows("light.b")).toBe(false); // still cached

    vi.setSystemTime(Date.now() + 1001);
    expect(await exposure.allows("light.b")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("defaults the TTL to one minute", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = vi.fn(async () => set("light.a"));
    const exposure = new AssistExposure(fetcher);
    await exposure.list();
    vi.setSystemTime(Date.now() + 50 * 1000);
    await exposure.list();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + 20 * 1000);
    await exposure.list();
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("re-reads the set before refusing, so exposing and asking again works at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let exposed = set("light.a");
    const fetcher = vi.fn(async () => exposed);
    const exposure = new AssistExposure(fetcher, 60 * 60 * 1000);

    expect(await exposure.allows("lock.front_door")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);

    exposed = set("light.a", "lock.front_door");
    vi.setSystemTime(Date.now() + 15 * 1000);
    expect(await exposure.allows("lock.front_door")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("re-reads before refusing at most once per pacing window, never for an exposed entity", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetcher = vi.fn(async () => set("light.a"));
    const exposure = new AssistExposure(fetcher, 60 * 60 * 1000);

    await exposure.list();
    vi.setSystemTime(Date.now() + 15 * 1000);
    expect(await exposure.allows("lock.front_door")).toBe(false);
    expect(await exposure.allows("switch.garage")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 15 * 1000);
    expect(await exposure.allows("light.a")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("collapses concurrent reads into one fetch", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return set("light.a");
    });
    const exposure = new AssistExposure(fetcher);

    await Promise.all([
      exposure.allows("light.a"),
      exposure.allows("light.b"),
      exposure.list(),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good list when a refresh fails", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let fail = false;
    const exposure = new AssistExposure(async () => {
      if (fail) throw new Error("websocket down");
      return set("light.a");
    }, 1000);

    expect(await exposure.allows("light.b")).toBe(false);

    fail = true;
    vi.setSystemTime(Date.now() + 1001);
    // Falling back to "no opinion" here would hand the model the whole house
    // the moment the websocket hiccups; the known-good answer is better.
    expect(await exposure.allows("light.b")).toBe(false);
    expect(await exposure.allows("light.a")).toBe(true);
    vi.useRealTimers();
  });

  it("keeps the last good list when the fetcher reports a failed read as null", async () => {
    // fetchExposedEntities never throws: a websocket error resolves to null.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: Set<string> | null = set("light.a");
    const exposure = new AssistExposure(async () => answer, 1000);

    expect(await exposure.allows("light.b")).toBe(false);

    answer = null;
    vi.setSystemTime(Date.now() + 1001);
    expect(await exposure.allows("light.b")).toBe(false);
    vi.useRealTimers();
  });

  it("caches no opinion instead of re-reading on every call", async () => {
    const fetcher = vi.fn(async () => set());
    const exposure = new AssistExposure(fetcher);

    await exposure.allows("light.a");
    await exposure.allows("light.b");
    await exposure.list();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("retries a failed read after the retry delay, not on every call", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: Set<string> | null = null;
    const fetcher = vi.fn(async () => answer);
    const exposure = new AssistExposure(fetcher, 60_000, 1000);

    expect(await exposure.allows("light.b")).toBe(true);
    expect(await exposure.allows("light.b")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);

    answer = set("light.a");
    vi.setSystemTime(Date.now() + 1001);
    expect(await exposure.allows("light.b")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("filters a list of states, preserving order", async () => {
    const exposure = new AssistExposure(async () => set("light.a", "light.c"));
    const states = ["light.a", "light.b", "light.c"].map((entity_id) => ({
      entity_id,
      state: "on",
      attributes: {},
      last_changed: "",
      last_updated: "",
    }));

    expect((await exposure.filter(states)).map((s) => s.entity_id)).toEqual([
      "light.a",
      "light.c",
    ]);
  });

  it("always allows a voice engine, and keeps it when filtering", async () => {
    const exposure = new AssistExposure(async () => set("light.a"));
    expect(await exposure.allows("tts.piper")).toBe(true);
    expect(await exposure.allows("media_player.bedroom")).toBe(false);
    const states = ["tts.piper", "media_player.bedroom", "light.a"].map((entity_id) => ({
      entity_id,
      state: "on",
      attributes: {},
      last_changed: "",
      last_updated: "",
    }));
    expect((await exposure.filter(states)).map((s) => s.entity_id)).toEqual(["tts.piper", "light.a"]);
  });
});
