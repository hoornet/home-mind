import { describe, it, expect } from "vitest";
import {
  assertServiceName,
  isVoiceEngine,
  mediaRefusal,
  normalizeEntityId,
  notifyRefusal,
  serviceRefusal,
} from "./service-policy.js";

describe("assertServiceName", () => {
  it("accepts plain Home Assistant names", () => {
    expect(() => assertServiceName("light", "turn_on")).not.toThrow();
    expect(() => assertServiceName("media_player", "volume_set")).not.toThrow();
    expect(() => assertServiceName("climate", "set_temperature")).not.toThrow();
  });

  it("refuses anything but a plain name", () => {
    for (const [domain, service] of [
      ["light/x", "turn_on"],
      ["light", "turn_on.x"],
      ["light", "turn_on/x"],
      ["light", "turn_on\\x"],
      ["light", "turn_on?x"],
      ["light", "turn_on#x"],
      ["light", "turn_on%2F"],
      ["light", "turn on"],
      ["Light", "turn_on"],
      ["", "turn_on"],
      [undefined, "turn_on"],
      ["light", 42],
    ]) {
      expect(() => assertServiceName(domain, service)).toThrow(/Invalid service (domain|name)/);
    }
  });
});

describe("normalizeEntityId", () => {
  it("returns the id as Home Assistant stores it", () => {
    expect(normalizeEntityId("light.kitchen")).toBe("light.kitchen");
    expect(normalizeEntityId("  Light.Kitchen ")).toBe("light.kitchen");
  });

  it("refuses anything but one entity id", () => {
    for (const id of [
      "light.kitchen/x",
      "light.kitchen,light.hall",
      "light.kitchen x",
      "light",
      "light.",
      ".kitchen",
      "light.kitchen.extra",
      "",
      undefined,
      ["light.kitchen"],
    ]) {
      expect(() => normalizeEntityId(id)).toThrow(/Invalid entity_id/);
    }
  });
});

describe("serviceRefusal", () => {
  it("refuses anything outside everyday device control, whatever the call names", () => {
    for (const [domain, service] of [
      ["homeassistant", "restart"],
      ["homeassistant", "stop"],
      ["homeassistant", "reload_all"],
      ["hassio", "host_reboot"],
      ["hassio", "addon_stop"],
      ["backup", "create"],
      ["shell_command", "anything"],
      ["rest_command", "anything"],
      ["mqtt", "publish"],
      ["recorder", "purge"],
      ["conversation", "process"],
      ["some_integration", "set_value"],
      ["persistent_notification", "create"],
      ["input_select", "set_options"],
      ["tts", "clear_cache"],
      ["script", "reload"],
      ["automation", "reload"],
    ]) {
      expect(serviceRefusal(domain, service, true)).toMatch(/is not available to you/);
      expect(serviceRefusal(domain, service, false)).toMatch(/is not available to you/);
    }
  });

  it("allows everyday device control when it names what it acts on", () => {
    for (const [domain, service] of [
      ["light", "turn_on"],
      ["lock", "unlock"],
      ["cover", "set_cover_position"],
      ["climate", "set_temperature"],
      ["media_player", "play_media"],
      ["vacuum", "return_to_base"],
      ["homeassistant", "turn_off"],
      ["script", "good_night"],
      ["script", "turn_on"],
      ["scene", "turn_on"],
      ["todo", "add_item"],
      ["weather", "get_forecasts"],
      ["tts", "speak"],
      ["tts", "google_translate_say"],
      ["notify", "send_message"],
    ]) {
      expect(serviceRefusal(domain, service, true)).toBeNull();
    }
  });

  it("refuses a call that names nothing, except notifications and the shopping list", () => {
    expect(serviceRefusal("light", "turn_off", false)).toMatch(/names no entity/);
    expect(serviceRefusal("homeassistant", "turn_off", false)).toMatch(/names no entity/);
    expect(serviceRefusal("notify", "mobile_app_phone", false)).toBeNull();
    expect(serviceRefusal("shopping_list", "add_item", false)).toBeNull();
  });
});

describe("isVoiceEngine", () => {
  it("is a whole tts entity id, not a prefix", () => {
    expect(isVoiceEngine("tts.piper")).toBe(true);
    for (const id of ["tts.piper.extra", "tts.", "tts", "light.tts", "tts.a,tts.b"]) {
      expect(isVoiceEngine(id)).toBe(false);
    }
  });
});

describe("notifyRefusal", () => {
  it("refuses a recipient the assistant picked itself", () => {
    expect(notifyRefusal("email", { message: "hi", target: "someone@example.com" })).toMatch(/target/);
    expect(notifyRefusal("mobile_app_phone", { message: "hi", data: { target: ["x"] } })).toMatch(/target/);
    expect(notifyRefusal("mobile_app_phone", { message: "hi" }, { entity_id: "x" })).toMatch(/target/);
  });

  it("lets notify.send_message name the notify entity it sends to", () => {
    expect(notifyRefusal("send_message", { message: "hi" }, { entity_id: "notify.kitchen" })).toBeNull();
  });

  it("refuses the companion app's commands to the phone, written out or assembled", () => {
    for (const message of [
      "command_dnd",
      "request_location_update",
      "clear_notification",
      "remove_channel",
      "TTS",
      "{{ 'x' }} command_dnd",
      "comm{{ 'and_dnd' }}",
      "{{ 'command' }}_dnd",
      "comm {{- 'and_dnd' }}",
    ]) {
      expect(notifyRefusal("mobile_app_phone", { message })).toMatch(/command to the phone/);
    }
    expect(notifyRefusal("mobile_app_phone", { message: "{{ 'x' }}" })).toMatch(/plain text/);
  });

  it("lets an ordinary message through, templated or not", () => {
    expect(notifyRefusal("mobile_app_phone", { message: "Dinner is ready", title: "Kitchen" })).toBeNull();
    expect(notifyRefusal("mobile_app_phone", { message: "TTS engine is fine" })).toBeNull();
    expect(
      notifyRefusal("mobile_app_phone", { message: "It is {{ states('sensor.outside') }} outside" })
    ).toBeNull();
    expect(notifyRefusal("mobile_app_phone", { message: "Now {{ states('sensor.outside') }}" })).toBeNull();
    expect(notifyRefusal("mobile_app_phone", { message: "Hi {{ name }}!" })).toBeNull();
  });
});

describe("mediaRefusal", () => {
  it("plays libraries, radio, voices, local audio and streaming ids", () => {
    for (const id of [
      "media-source://radio_browser/abc",
      "media-source://tts/cloud?message=hi",
      "media-source://jellyfin/abc123",
      "media-source://dlna_dms/server/:item",
      "media-source://media_source/local/music/song.mp3",
      "media-source://media_source/local/music/Album/02 Track.FLAC",
      "plex://{\"library_name\": \"Music\"}",
      "library://track/42",
      "spotify:track:123",
      "FV:2/31",
    ]) {
      expect(mediaRefusal({ media_content_id: id })).toBeNull();
    }
  });

  it("browses the local media folder but plays only audio from it", () => {
    expect(mediaRefusal({ media_content_id: "media-source://media_source/local/music" }, true)).toBeNull();
    expect(
      mediaRefusal({ media_content_id: "media-source://media_source/local/clips/x.mp4" })
    ).toMatch(/is not available to you/);
  });

  it("refuses providers not listed, templates, paths and fetched addresses", () => {
    for (const id of [
      "media-source://some_source/item",
      "media-source:///x",
      "MEDIA-SOURCE://jellyfin/abc",
      "{{ 'media-source://' ~ 'x' }}",
      "/media/local/x.mp3",
      "https://stream.example.org/live.mp3",
      "http://stream.example.org/live.mp3",
      "rtsp://example.org/x",
      "file:///config/x",
      "smb://nas/share/x",
    ]) {
      expect(mediaRefusal({ media_content_id: id })).toMatch(/is not available to you/);
      expect(mediaRefusal({ media_id: id })).toMatch(/is not available to you/);
    }
  });

  it("finds media ids at any depth of the fields", () => {
    expect(
      mediaRefusal({ message: "Hi", preannounce_media_id: "media-source://some_source/x" })
    ).toMatch(/is not available to you/);
    expect(
      mediaRefusal({ media: { media_content_id: "media-source://some_source/x" } })
    ).toMatch(/is not available to you/);
  });
});
