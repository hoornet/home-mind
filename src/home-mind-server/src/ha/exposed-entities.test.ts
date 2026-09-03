import { describe, it, expect } from "vitest";
import { websocketUrl } from "./exposed-entities.js";

describe("websocketUrl", () => {
  it("uses /core/websocket behind the Supervisor proxy", () => {
    // The add-on reaches HA at http://supervisor/core, where the websocket is
    // /core/websocket. Sending the add-on token to /api/websocket instead is
    // rejected with auth_invalid, so this is not interchangeable.
    expect(websocketUrl("http://supervisor/core")).toBe("ws://supervisor/core/websocket");
    expect(websocketUrl("http://supervisor/core/")).toBe("ws://supervisor/core/websocket");
  });

  it("uses /api/websocket for a direct instance", () => {
    expect(websocketUrl("http://192.168.1.10:8123")).toBe("ws://192.168.1.10:8123/api/websocket");
  });

  it("keeps TLS", () => {
    expect(websocketUrl("https://ha.example.com")).toBe("wss://ha.example.com/api/websocket");
  });
});
