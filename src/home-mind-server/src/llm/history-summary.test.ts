import { describe, it, expect } from "vitest";
import {
  summarizeHistory,
  chooseBucketMinutes,
  RAW_LIMIT,
  TARGET_BUCKETS,
} from "./history-summary.js";

/** A week of readings every minute, with a daily spike between 18:00 and 19:00. */
function weekOfVoc(): { state: string; last_changed: string }[] {
  const out: { state: string; last_changed: string }[] = [];
  const start = Date.UTC(2026, 7, 26, 0, 0, 0);
  for (let minute = 0; minute < 7 * 24 * 60; minute++) {
    const ts = start + minute * 60000;
    const hour = new Date(ts).getUTCHours();
    const spiking = hour === 18;
    out.push({
      state: String(spiking ? 400 + (minute % 20) : 100 + (minute % 10)),
      last_changed: new Date(ts).toISOString(),
    });
  }
  return out;
}

describe("chooseBucketMinutes", () => {
  it("gives hourly buckets for a week", () => {
    expect(chooseBucketMinutes(7 * 24 * 60)).toBe(60);
  });

  it("gives fine buckets for a short window and never goes below a minute", () => {
    expect(chooseBucketMinutes(60)).toBe(1);
    expect(chooseBucketMinutes(1)).toBe(1);
  });

  it("caps at a day rather than inventing ever larger intervals", () => {
    expect(chooseBucketMinutes(365 * 24 * 60)).toBe(1440);
  });
});

describe("summarizeHistory", () => {
  it("passes short histories through untouched", () => {
    const entries = [
      { state: "22", last_changed: "2026-01-01T00:00:00.000Z" },
      { state: "23", last_changed: "2026-01-01T01:00:00.000Z" },
    ];
    const summary = summarizeHistory("sensor.temp", entries);
    expect(summary).toEqual({
      entity_id: "sensor.temp",
      kind: "raw",
      points: entries,
    });
  });

  it("keeps an hourly spike visible across a week, which sampling did not", () => {
    const summary = summarizeHistory("sensor.voc", weekOfVoc(), "ppb");
    if (summary.kind !== "numeric") throw new Error("expected numeric buckets");

    expect(summary.bucket_minutes).toBe(60);
    expect(summary.unit).toBe("ppb");
    expect(summary.buckets.length).toBeLessThanOrEqual(TARGET_BUCKETS + 1);

    // Every 18:00 bucket must show the spike, on all seven days, and no other
    // hour may. This is the property the even-sampling version could not hold:
    // one sample per 50 minutes reduced an hour-long spike to a coin flip.
    const spiking = summary.buckets.filter((b) => b.max > 300);
    expect(spiking).toHaveLength(7);
    for (const bucket of spiking) {
      expect(new Date(bucket.t).getUTCHours()).toBe(18);
    }
  });

  it("reports readings per bucket so the model can see its own sample size", () => {
    const summary = summarizeHistory("sensor.voc", weekOfVoc());
    if (summary.kind !== "numeric") throw new Error("expected numeric buckets");
    expect(summary.buckets[0].n).toBe(60);
  });

  it("summarizes non-numeric states by dominant value and change count", () => {
    // Presence: mostly off, with a burst of activity in one hour.
    const entries: { state: string; last_changed: string }[] = [];
    const start = Date.UTC(2026, 7, 26, 0, 0, 0);
    for (let minute = 0; minute < 7 * 24 * 60; minute++) {
      const ts = start + minute * 60000;
      const busy = new Date(ts).getUTCHours() === 18;
      entries.push({
        state: busy && minute % 2 === 0 ? "on" : "off",
        last_changed: new Date(ts).toISOString(),
      });
    }

    const summary = summarizeHistory("binary_sensor.presence", entries);
    if (summary.kind !== "state") throw new Error("expected state buckets");

    const busy = summary.buckets.filter((b) => b.changes > 0);
    expect(busy).toHaveLength(7);
    for (const bucket of busy) {
      expect(new Date(bucket.t).getUTCHours()).toBe(18);
    }
    const quiet = summary.buckets.find((b) => b.changes === 0);
    expect(quiet?.state).toBe("off");
  });

  it("drops unavailable and unknown rather than letting them skew a mean", () => {
    const entries = [
      { state: "10", last_changed: "2026-01-01T00:00:00.000Z" },
      { state: "unavailable", last_changed: "2026-01-01T00:01:00.000Z" },
      { state: "unknown", last_changed: "2026-01-01T00:02:00.000Z" },
      { state: "20", last_changed: "2026-01-01T00:03:00.000Z" },
    ];
    const summary = summarizeHistory("sensor.temp", entries);
    if (summary.kind !== "raw") throw new Error("expected raw points");
    expect(summary.points.map((p) => p.state)).toEqual(["10", "20"]);
  });

  it("treats a mostly-numeric series with one stray text state as numeric", () => {
    const entries = Array.from({ length: RAW_LIMIT + 50 }, (_, i) => ({
      state: i === 7 ? "calibrating" : String(i),
      last_changed: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
    }));
    expect(summarizeHistory("sensor.temp", entries).kind).toBe("numeric");
  });

  it("handles an empty history", () => {
    expect(summarizeHistory("sensor.temp", [])).toEqual({
      entity_id: "sensor.temp",
      kind: "raw",
      points: [],
    });
  });
});

describe("token cost versus the sampling it replaces", () => {
  it("is smaller than 200 raw rows while covering every reading", () => {
    const entries = weekOfVoc();

    // What the old path sent: 200 evenly spaced rows, each carrying the entity
    // id and a full ISO timestamp.
    const sampled = Array.from({ length: 200 }, (_, i) => ({
      entity_id: "sensor.voc",
      state: entries[Math.round(i * ((entries.length - 1) / 199))].state,
      last_changed: entries[Math.round(i * ((entries.length - 1) / 199))].last_changed,
    }));

    const before = JSON.stringify(sampled).length;
    const after = JSON.stringify(summarizeHistory("sensor.voc", entries)).length;

    expect(after).toBeLessThan(before);
  });
});
