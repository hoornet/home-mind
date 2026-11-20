import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EXPOSURE_UNREADABLE_NOTIFICATION_ID,
  NOTHING_EXPOSED_NOTIFICATION_ID,
  postNothingExposedNotice,
  scheduleNothingExposedNotice,
} from "./nothing-exposed-notice.js";

function fakeHa() {
  return { callService: vi.fn().mockResolvedValue(undefined) };
}

const reading = (answer: Set<string> | null) => ({ list: vi.fn().mockResolvedValue(answer) });
const calls = (ha: ReturnType<typeof fakeHa>, service: string) =>
  ha.callService.mock.calls.filter((c) => c[1] === service).map((c) => c[3]);

describe("postNothingExposedNotice", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts the notice when nothing is exposed", async () => {
    const ha = fakeHa();

    expect(await postNothingExposedNotice(ha, reading(new Set()))).toBe(true);

    const [created] = calls(ha, "create");
    expect(created.notification_id).toBe(NOTHING_EXPOSED_NOTIFICATION_ID);
    expect(created.message).toContain("Settings → Voice assistants → Expose");
  });

  it("clears the notice once something is exposed", async () => {
    const ha = fakeHa();

    expect(await postNothingExposedNotice(ha, reading(new Set(["light.kitchen"])))).toBe(false);

    expect(calls(ha, "create")).toHaveLength(0);
    expect(calls(ha, "dismiss")).toEqual([
      { notification_id: EXPOSURE_UNREADABLE_NOTIFICATION_ID },
      { notification_id: NOTHING_EXPOSED_NOTIFICATION_ID },
    ]);
  });

  it("says nothing at first while the list cannot be read, and asks to be retried", async () => {
    const ha = fakeHa();

    await expect(postNothingExposedNotice(ha, reading(null))).rejects.toThrow(/could not be read/);
    expect(ha.callService).not.toHaveBeenCalled();
  });

  it("tells the user when the list still cannot be read", async () => {
    const ha = fakeHa();

    await expect(
      postNothingExposedNotice(ha, reading(null), { reportUnreadable: true })
    ).rejects.toThrow(/could not be read/);
    const [created] = calls(ha, "create");
    expect(created.notification_id).toBe(EXPOSURE_UNREADABLE_NOTIFICATION_ID);
  });
});

describe("scheduleNothingExposedNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for Home Assistant to settle, then retries until the list can be read", async () => {
    const ha = fakeHa();
    const exposure = { list: vi.fn() };
    exposure.list.mockResolvedValueOnce(null).mockResolvedValue(new Set());

    scheduleNothingExposedNotice(ha, exposure, { delayMs: 1000, retryMs: 5000, attempts: 3 });
    expect(exposure.list).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000); // unreadable
    expect(calls(ha, "create")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000); // read: empty
    await vi.advanceTimersByTimeAsync(60_000);

    expect(calls(ha, "create")).toHaveLength(1);
  });

  it("reports an unreadable list from the second try, and keeps trying until it can be read", async () => {
    const ha = fakeHa();
    let answer: Set<string> | null = null;
    const exposure = { list: vi.fn(async () => answer) };

    scheduleNothingExposedNotice(ha, exposure, { delayMs: 1000, retryMs: 5000, attempts: 2 });
    await vi.advanceTimersByTimeAsync(1000); // first try: quiet
    expect(calls(ha, "create")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000); // second try: reported
    expect(calls(ha, "create").map((c) => c.notification_id)).toEqual([EXPOSURE_UNREADABLE_NOTIFICATION_ID]);
    await vi.advanceTimersByTimeAsync(5000); // past its attempts, still trying
    answer = new Set(["light.kitchen"]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls(ha, "dismiss").map((c) => c.notification_id)).toContain(EXPOSURE_UNREADABLE_NOTIFICATION_ID);
    const reads = exposure.list.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exposure.list.mock.calls.length).toBe(reads); // and stops once it could
  });

  it("can be cancelled before it runs", async () => {
    const ha = fakeHa();
    const exposure = reading(new Set());

    const cancel = scheduleNothingExposedNotice(ha, exposure, { delayMs: 1000 });
    cancel();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(exposure.list).not.toHaveBeenCalled();
  });
});
