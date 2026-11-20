import type { HomeAssistantClient } from "../ha/client.js";

/**
 * Since 0.21.0 the add-on (and deploy.sh) generate an API token, which the
 * server enforces once the Home Mind integration has used it. Until then the
 * API is open as before, so the user is told, and told what to do.
 */

export const UNPROTECTED_API_NOTIFICATION_ID = "home_mind_api_unprotected";

export const UNPROTECTED_API_NOTICE = {
  title: "Home Mind's API is not protected yet",
  message:
    "Home Mind has an API token, but the Home Mind integration in Home Assistant is not using " +
    "it yet, so anything on your network can still talk to Home Mind.\n\n" +
    "With the add-on, update the Home Mind integration in HACS to 0.11.0 or later and restart " +
    "Home Assistant: it picks the token up by itself and this notice goes away. If you added " +
    "the integration by hand, remove it and add it again with a token: for the add-on, accept " +
    "the discovered add-on, or set your own `api_token` in its options and enter that; for " +
    "Docker, use `API_TOKEN_AUTO` from your `.env` file.",
};

type Notifier = Pick<HomeAssistantClient, "callService">;

/** Post the notice while the token is unconfirmed, clear it once it is. */
export async function postApiTokenNotice(ha: Notifier, confirmed: () => boolean): Promise<void> {
  if (confirmed()) {
    await ha.callService("persistent_notification", "dismiss", undefined, {
      notification_id: UNPROTECTED_API_NOTIFICATION_ID,
    });
    return;
  }
  await ha.callService("persistent_notification", "create", undefined, {
    notification_id: UNPROTECTED_API_NOTIFICATION_ID,
    ...UNPROTECTED_API_NOTICE,
  });
  console.log("[auth] The integration does not use the API token yet: posted a notification");
}

/**
 * Check a few minutes after startup, once Home Assistant and the integration
 * have had time to connect. Returns a function that cancels it.
 */
export function scheduleApiTokenNotice(
  ha: Notifier,
  confirmed: () => boolean,
  { delayMs = 5 * 60_000, retryMs = 5 * 60_000, attempts = 6 } = {}
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let left = attempts;
  const run = () => {
    left--;
    postApiTokenNotice(ha, confirmed).catch((err) => {
      console.warn(`[auth] Could not post the API token notice: ${String(err)}`);
      if (left > 0) timer = setTimeout(run, retryMs);
    });
  };
  timer = setTimeout(run, delayMs);
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
