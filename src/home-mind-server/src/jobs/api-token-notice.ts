import type { HomeAssistantClient } from "../ha/client.js";

/**
 * Since 0.21.0 the add-on (and deploy.sh) generate an API token, which the
 * server enforces once the Home Mind integration has used it. Until then the
 * API is open as before, so the user is told, and told what to do. A server
 * with no token at all (Docker started without deploy.sh, or run by hand)
 * says so too, under the same notification.
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

export const OPEN_API_NOTICE = {
  title: "Home Mind's API has no token",
  message:
    "Home Mind runs without an API token, so anything on your network can talk to it.\n\n" +
    "With Docker, run `scripts/deploy.sh` once: it creates a token, `API_TOKEN_AUTO` in your " +
    "`.env` file. Then remove the Home Mind integration in Home Assistant and add it again with " +
    "that token. You can also set your own `API_TOKEN` instead and use it in the integration.",
};

type Notice = { title: string; message: string };

type Notifier = Pick<HomeAssistantClient, "callService">;

/**
 * Post the notice while the token is unconfirmed (or absent), clear it once
 * it is in use. Returns whether the notice was posted.
 */
export async function postApiTokenNotice(
  ha: Notifier,
  confirmed: () => boolean,
  notice: Notice = UNPROTECTED_API_NOTICE
): Promise<boolean> {
  if (confirmed()) {
    await ha.callService("persistent_notification", "dismiss", undefined, {
      notification_id: UNPROTECTED_API_NOTIFICATION_ID,
    });
    return false;
  }
  await ha.callService("persistent_notification", "create", undefined, {
    notification_id: UNPROTECTED_API_NOTIFICATION_ID,
    ...notice,
  });
  console.log("[auth] The API is not protected yet: posted a notification in Home Assistant");
  return true;
}

/**
 * Check a few minutes after startup, once Home Assistant and the integration
 * have had time to connect, and again every `repeatMs` while the API is not
 * protected: Home Assistant forgets notifications when it restarts, and the
 * notice is the only reminder. Stops once the token is in use. Returns a
 * function that cancels it.
 */
export function scheduleApiTokenNotice(
  ha: Notifier,
  confirmed: () => boolean,
  {
    delayMs = 5 * 60_000,
    retryMs = 5 * 60_000,
    attempts = 6,
    repeatMs = 6 * 60 * 60_000,
    notice = UNPROTECTED_API_NOTICE,
  } = {}
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let cancelled = false;
  let left = attempts;
  const later = (ms: number) => {
    if (!cancelled) timer = setTimeout(run, ms);
  };
  const run = () => {
    postApiTokenNotice(ha, confirmed, notice)
      .then((posted) => {
        left = attempts;
        if (posted) later(repeatMs);
      })
      .catch((err) => {
        console.warn(`[auth] Could not post the API token notice: ${String(err)}`);
        left--;
        later(left > 0 ? retryMs : repeatMs);
      });
  };
  later(delayMs);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
