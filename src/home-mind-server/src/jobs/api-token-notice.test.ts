import { describe, it, expect, vi } from "vitest";
import { API_TOKEN_NOTIFICATION_ID, postApiTokenNotice } from "./api-token-notice.js";

describe("postApiTokenNotice", () => {
  it("tells the user while the integration does not use the token", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ha = { callService: vi.fn().mockResolvedValue(undefined) };
    await postApiTokenNotice(ha, () => false);
    expect(ha.callService).toHaveBeenCalledWith(
      "persistent_notification",
      "create",
      undefined,
      expect.objectContaining({ notification_id: API_TOKEN_NOTIFICATION_ID })
    );
    vi.restoreAllMocks();
  });

  it("clears the notice once the token is in use", async () => {
    const ha = { callService: vi.fn().mockResolvedValue(undefined) };
    await postApiTokenNotice(ha, () => true);
    expect(ha.callService).toHaveBeenCalledWith("persistent_notification", "dismiss", undefined, {
      notification_id: API_TOKEN_NOTIFICATION_ID,
    });
  });
});
