import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  OPEN_API_NOTICE,
  UNPROTECTED_API_NOTIFICATION_ID,
  postApiTokenNotice,
  scheduleApiTokenNotice,
} from "./api-token-notice.js";

describe("postApiTokenNotice", () => {
  it("tells the user while the integration does not use the token", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ha = { callService: vi.fn().mockResolvedValue(undefined) };
    await postApiTokenNotice(ha, () => false);
    expect(ha.callService).toHaveBeenCalledWith(
      "persistent_notification",
      "create",
      undefined,
      expect.objectContaining({ notification_id: UNPROTECTED_API_NOTIFICATION_ID })
    );
    vi.restoreAllMocks();
  });

  it("tells the user when the server has no token at all", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ha = { callService: vi.fn().mockResolvedValue(undefined) };
    await postApiTokenNotice(ha, () => false, OPEN_API_NOTICE);
    expect(ha.callService).toHaveBeenCalledWith("persistent_notification", "create", undefined, {
      notification_id: UNPROTECTED_API_NOTIFICATION_ID,
      ...OPEN_API_NOTICE,
    });
    expect(OPEN_API_NOTICE.message).toContain("scripts/deploy.sh");
    vi.restoreAllMocks();
  });

  it("clears the notice once the token is in use", async () => {
    const ha = { callService: vi.fn().mockResolvedValue(undefined) };
    await postApiTokenNotice(ha, () => true);
    expect(ha.callService).toHaveBeenCalledWith("persistent_notification", "dismiss", undefined, {
      notification_id: UNPROTECTED_API_NOTIFICATION_ID,
    });
  });
});

describe("scheduleApiTokenNotice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const created = (ha: { callService: ReturnType<typeof vi.fn> }) =>
    ha.callService.mock.calls.filter((c) => c[1] === "create").length;

  it("says it again while the API is not protected, and stops once it is", async () => {
    const ha = { callService: vi.fn().mockResolvedValue(undefined) };
    let inUse = false;
    scheduleApiTokenNotice(ha, () => inUse, { delayMs: 1000, repeatMs: 10_000 });

    await vi.advanceTimersByTimeAsync(1000);
    expect(created(ha)).toBe(1);
    await vi.advanceTimersByTimeAsync(10_000); // Home Assistant may have restarted since
    expect(created(ha)).toBe(2);

    inUse = true;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ha.callService).toHaveBeenLastCalledWith("persistent_notification", "dismiss", undefined, {
      notification_id: UNPROTECTED_API_NOTIFICATION_ID,
    });
    const calls = ha.callService.mock.calls.length;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(ha.callService.mock.calls.length).toBe(calls);
  });

  it("retries when Home Assistant can't be reached, and can be cancelled", async () => {
    const ha = { callService: vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(undefined) };
    const cancel = scheduleApiTokenNotice(ha, () => false, { delayMs: 1000, retryMs: 2000, repeatMs: 10_000 });

    await vi.advanceTimersByTimeAsync(1000); // fails
    expect(created(ha)).toBe(1);
    await vi.advanceTimersByTimeAsync(2000); // retried
    expect(created(ha)).toBe(2);

    cancel();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(created(ha)).toBe(2);
  });
});
