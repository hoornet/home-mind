/**
 * Turning a week of recorder rows into something a model can reason about.
 *
 * The old approach evenly sampled long histories down to 200 entries. That is
 * unbiased and cheap, and for a question like "when did the spike happen" it is
 * useless: 200 points across 7 days is one reading every 50 minutes, so an hour
 * long spike contributes about one sample and its shape, height and duration are
 * simply not in the data. The model then has to answer anyway, from evidence
 * that cannot support the answer.
 *
 * Buckets fix that. Every reading in the window contributes to a summary of the
 * interval it falls in, so a spike shows up as a high `max` in the hours it
 * occurred rather than being sampled past. It is also *cheaper*: one bucket line
 * carries what dozens of raw rows carried, and the entity id is stated once
 * instead of on every row.
 */

export interface RawPoint {
  state: string;
  last_changed: string;
}

export interface NumericBucket {
  /** ISO start of the interval. */
  t: string;
  /** Readings that fell in it. */
  n: number;
  min: number;
  max: number;
  mean: number;
}

export interface StateBucket {
  t: string;
  n: number;
  /** The state held for the most readings in this interval. */
  state: string;
  /** How many times the value changed within it. */
  changes: number;
}

export type HistorySummary =
  | { entity_id: string; kind: "raw"; points: RawPoint[] }
  | {
      entity_id: string;
      kind: "numeric";
      bucket_minutes: number;
      unit?: string;
      buckets: NumericBucket[];
    }
  | {
      entity_id: string;
      kind: "state";
      bucket_minutes: number;
      buckets: StateBucket[];
    };

/** Below this many readings, raw rows are small enough to just hand over. */
export const RAW_LIMIT = 200;

/** Buckets to aim for. 168 is one per hour across a week, which is the shape most of these questions have. */
export const TARGET_BUCKETS = 168;

/** Bucket sizes we will round to, in minutes. Round numbers so the output reads like a clock. */
const BUCKET_CHOICES = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

/**
 * Pick an interval that lands near TARGET_BUCKETS without inventing precision.
 * Always returns one of BUCKET_CHOICES so bucket starts fall on recognisable
 * boundaries rather than on an arbitrary offset from the first reading.
 */
export function chooseBucketMinutes(spanMinutes: number): number {
  const ideal = spanMinutes / TARGET_BUCKETS;
  for (const choice of BUCKET_CHOICES) {
    if (choice >= ideal) return choice;
  }
  return BUCKET_CHOICES[BUCKET_CHOICES.length - 1];
}

function isNumeric(value: string): boolean {
  if (value === "") return false;
  const n = Number(value);
  return Number.isFinite(n);
}

/** Floor a timestamp to the start of its bucket, so boundaries are stable. */
function bucketStart(ms: number, bucketMs: number): number {
  return Math.floor(ms / bucketMs) * bucketMs;
}

/** Round to at most 2 decimals, without trailing zero noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Summarize one entity's history.
 *
 * Short histories pass through as raw points. Longer ones are bucketed, and how
 * depends on what the states actually are: numbers get min/max/mean, everything
 * else (on/off, home/away, a thermostat mode) gets the state it held longest
 * plus how often it changed, because averaging "on" is meaningless.
 */
export function summarizeHistory(
  entityId: string,
  entries: { state: string; last_changed: string }[],
  unit?: string
): HistorySummary {
  // Unavailable/unknown carry no signal for either treatment and would drag a
  // mean around if they parsed, so drop them before deciding anything.
  const present = entries.filter(
    (e) => e.state !== "unavailable" && e.state !== "unknown"
  );

  const raw = (points: { state: string; last_changed: string }[]): HistorySummary => ({
    entity_id: entityId,
    kind: "raw",
    points: points.map((e) => ({ state: e.state, last_changed: e.last_changed })),
  });

  if (present.length <= RAW_LIMIT) return raw(present);

  // Bucketing is the only thing that needs a usable timestamp, so require one
  // here rather than up front: a reading with no `last_changed` is still worth
  // passing through verbatim, it simply cannot be placed on a timeline.
  const usable = present.filter(
    (e) => e.last_changed && Number.isFinite(Date.parse(e.last_changed))
  );
  if (usable.length <= RAW_LIMIT) return raw(usable);

  const times = usable.map((e) => Date.parse(e.last_changed));
  const first = Math.min(...times);
  const last = Math.max(...times);
  const spanMinutes = Math.max(1, (last - first) / 60000);
  const bucketMinutes = chooseBucketMinutes(spanMinutes);
  const bucketMs = bucketMinutes * 60000;

  // A history is numeric only if essentially all of it is. A stray textual state
  // in a temperature series should not force the whole thing into state buckets.
  const numericCount = usable.reduce((acc, e) => acc + (isNumeric(e.state) ? 1 : 0), 0);
  const numeric = numericCount / usable.length > 0.9;

  const groups = new Map<number, { state: string; value: number }[]>();
  for (let i = 0; i < usable.length; i++) {
    const ts = times[i];
    if (!Number.isFinite(ts)) continue;
    const key = bucketStart(ts, bucketMs);
    const list = groups.get(key);
    const point = { state: usable[i].state, value: Number(usable[i].state) };
    if (list) list.push(point);
    else groups.set(key, [point]);
  }

  const keys = [...groups.keys()].sort((a, b) => a - b);

  if (numeric) {
    const buckets: NumericBucket[] = keys.map((key) => {
      const points = groups.get(key)!.filter((p) => Number.isFinite(p.value));
      const values = points.map((p) => p.value);
      const sum = values.reduce((a, b) => a + b, 0);
      return {
        t: new Date(key).toISOString(),
        n: values.length,
        min: round2(Math.min(...values)),
        max: round2(Math.max(...values)),
        mean: round2(sum / values.length),
      };
    });
    return {
      entity_id: entityId,
      kind: "numeric",
      bucket_minutes: bucketMinutes,
      ...(unit ? { unit } : {}),
      buckets: buckets.filter((b) => b.n > 0),
    };
  }

  const buckets: StateBucket[] = keys.map((key) => {
    const points = groups.get(key)!;
    const counts = new Map<string, number>();
    let changes = 0;
    for (let i = 0; i < points.length; i++) {
      counts.set(points[i].state, (counts.get(points[i].state) ?? 0) + 1);
      if (i > 0 && points[i].state !== points[i - 1].state) changes++;
    }
    let state = points[0].state;
    let best = 0;
    for (const [candidate, count] of counts) {
      if (count > best) {
        best = count;
        state = candidate;
      }
    }
    return { t: new Date(key).toISOString(), n: points.length, state, changes };
  });

  return { entity_id: entityId, kind: "state", bucket_minutes: bucketMinutes, buckets };
}
