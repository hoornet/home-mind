import type { HomeAssistantClient } from "../ha/client.js";
import type { AssistExposure } from "../ha/exposure.js";

/**
 * Since 0.20.3 an install that exposes nothing to Assist gives the assistant
 * nothing to reach, where before it reached the whole house. Without a word
 * that looks like Home Mind broke, so the user gets one Home Assistant
 * notification at startup saying why and what to do. It is cleared at the
 * next start once something is exposed.
 *
 * A list that cannot be read allows nothing too, so when it still cannot be
 * read on the second try the user is told that instead, rather than finding
 * out from an assistant that can't do anything.
 */

export const NOTHING_EXPOSED_NOTIFICATION_ID = "home_mind_nothing_exposed";

export const NOTHING_EXPOSED_MESSAGE = {
  title: "Home Mind can't see any of your devices",
  message:
    "Nothing in your home is exposed to Assist, so Home Mind can't see or control any device.\n\n" +
    "To choose what Home Mind may use, go to Settings → Voice assistants → Expose and expose " +
    "the devices you want it to reach, just as you would for Home Assistant's own assistant. " +
    "Home Mind picks them up within a minute, with no restart.",
};

export const EXPOSURE_UNREADABLE_NOTIFICATION_ID = "home_mind_exposure_unreadable";

export const EXPOSURE_UNREADABLE_MESSAGE = {
  title: "Home Mind can't read which devices you've exposed",
  message:
    "Home Assistant hasn't told Home Mind which devices are exposed to Assist, so Home Mind " +
    "can't see or control any device for now. It keeps trying. If this doesn't clear, check " +
    "the Home Mind log. If your Home Assistant address starts with https:// and uses a " +
    "self-signed certificate, set HA_SKIP_TLS_VERIFY=true.",
};

type Notifier = Pick<HomeAssistantClient, "callService">;
type ExposureReader = Pick<AssistExposure, "list">;

/**
 * Post the notice when the list is empty, clear it when it is not. Throws
 * when the list or Home Assistant cannot be reached, so the caller can retry;
 * with `reportUnreadable`, an unreadable list is reported to the user first.
 */
export async function postNothingExposedNotice(
  ha: Notifier,
  exposure: ExposureReader,
  { reportUnreadable = false }: { reportUnreadable?: boolean } = {}
): Promise<boolean> {
  const exposed = await exposure.list();
  if (exposed === null) {
    if (reportUnreadable) {
      await ha.callService("persistent_notification", "create", undefined, {
        notification_id: EXPOSURE_UNREADABLE_NOTIFICATION_ID,
        ...EXPOSURE_UNREADABLE_MESSAGE,
      });
    }
    throw new Error("the Assist exposure list could not be read");
  }
  await ha.callService("persistent_notification", "dismiss", undefined, {
    notification_id: EXPOSURE_UNREADABLE_NOTIFICATION_ID,
  });
  if (exposed.size > 0) {
    await ha.callService("persistent_notification", "dismiss", undefined, {
      notification_id: NOTHING_EXPOSED_NOTIFICATION_ID,
    });
    return false;
  }
  await ha.callService("persistent_notification", "create", undefined, {
    notification_id: NOTHING_EXPOSED_NOTIFICATION_ID,
    ...NOTHING_EXPOSED_MESSAGE,
  });
  console.log("[exposure] Nothing is exposed to Assist: posted a notification saying so");
  return true;
}

/**
 * Check once Home Assistant has had a minute to settle, retrying a few times
 * if it cannot be reached yet. Returns a function that cancels it.
 */
export function scheduleNothingExposedNotice(
  ha: Notifier,
  exposure: ExposureReader,
  { delayMs = 60_000, retryMs = 300_000, attempts = 6 } = {}
): () => void {
  let timer: NodeJS.Timeout | null = null;
  let left = attempts;
  const run = () => {
    left--;
    // From the second try on: Home Assistant may still be starting at the first.
    const reportUnreadable = left < attempts - 1;
    postNothingExposedNotice(ha, exposure, { reportUnreadable }).catch((err) => {
      console.warn(`[exposure] Could not check what is exposed to Assist: ${String(err)}`);
      // Once the user has been told the list can't be read, keep trying, so
      // the notice clears as soon as it can be.
      if (left > 0 || reportUnreadable) timer = setTimeout(run, retryMs);
    });
  };
  timer = setTimeout(run, delayMs);
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
