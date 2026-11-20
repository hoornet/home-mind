import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthMiddleware, type AutomaticToken } from "./auth.js";

function call(
  middleware: ReturnType<typeof createAuthMiddleware>,
  path: string,
  authorization?: string
): number {
  let status = 200;
  const res = {
    status(code: number) {
      status = code;
      return { json: () => undefined };
    },
  };
  let passed = false;
  middleware({ path, headers: authorization ? { authorization } : {} } as never, res as never, () => {
    passed = true;
  });
  return passed ? 200 : status;
}

describe("createAuthMiddleware", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "home-mind-auth-"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("lets everything through with no token at all", () => {
    const mw = createAuthMiddleware(undefined);
    expect(call(mw, "/memory/u")).toBe(200);
  });

  it("enforces a token the user set from the first request", () => {
    const mw = createAuthMiddleware("secret");
    expect(call(mw, "/memory/u")).toBe(401);
    expect(call(mw, "/memory/u", "Bearer wrong")).toBe(403);
    expect(call(mw, "/memory/u", "Bearer secret")).toBe(200);
    expect(call(mw, "/health")).toBe(200);
  });

  it("enforces a generated token from the first request that carries it, across restarts", () => {
    const auto: AutomaticToken = { token: "generated", confirmedPath: join(dir, "state", "confirmed") };
    const onConfirmed = vi.fn();
    const mw = createAuthMiddleware(undefined, { ...auto, onConfirmed });

    expect(call(mw, "/memory/u")).toBe(200); // not yet in use: open, as before
    expect(call(mw, "/memory/u", "Bearer leftover")).toBe(200); // an old client's token still gets in
    expect(existsSync(auto.confirmedPath)).toBe(false); // but confirms nothing
    expect(mw.enforced()).toBe(false);

    expect(call(mw, "/memory/u", "Bearer generated")).toBe(200);
    expect(existsSync(auto.confirmedPath)).toBe(true);
    expect(onConfirmed).toHaveBeenCalledTimes(1);
    expect(call(mw, "/memory/u")).toBe(401); // and from now on it is required
    expect(call(mw, "/memory/u", "Bearer leftover")).toBe(403);
    expect(call(mw, "/health")).toBe(200);
    expect(mw.enforced()).toBe(true);

    const restarted = createAuthMiddleware(undefined, auto);
    expect(call(restarted, "/memory/u")).toBe(401);
    expect(call(restarted, "/memory/u", "Bearer generated")).toBe(200);
  });

  it("does not carry a confirmation over to a new token", () => {
    const path = join(dir, "confirmed");
    const first = createAuthMiddleware(undefined, { token: "first", confirmedPath: path });
    expect(call(first, "/memory/u", "Bearer first")).toBe(200);

    const renewed = createAuthMiddleware(undefined, { token: "second", confirmedPath: path });
    expect(renewed.enforced()).toBe(false);
    expect(call(renewed, "/memory/u")).toBe(200); // open until the new token is used
    expect(call(renewed, "/memory/u", "Bearer second")).toBe(200);
    expect(call(renewed, "/memory/u")).toBe(401);
  });

  it("does not take a file it did not write as a confirmation", () => {
    const path = join(dir, "confirmed");
    writeFileSync(path, "2026-11-20T15:00:00.000Z\n");
    const mw = createAuthMiddleware(undefined, { token: "generated", confirmedPath: path });
    expect(mw.enforced()).toBe(false);
  });

  it("reads the scheme in any case and tolerates extra spaces", () => {
    const mw = createAuthMiddleware(undefined, { token: "generated", confirmedPath: join(dir, "c") });
    expect(call(mw, "/memory/u", "bearer   generated")).toBe(200);
    expect(mw.enforced()).toBe(true);
    expect(call(mw, "/memory/u", "BEARER generated")).toBe(200);
    expect(call(mw, "/memory/u", "Basic generated")).toBe(401);
  });

  it("says at startup when the confirmation cannot be recorded, and enforces for the run anyway", () => {
    if (process.getuid?.() === 0) return; // root writes anywhere
    const locked = join(dir, "locked");
    rmSync(locked, { recursive: true, force: true });
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    const error = vi.mocked(console.error);
    const mw = createAuthMiddleware(undefined, { token: "generated", confirmedPath: join(locked, "c") });
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/Cannot write/));
    expect(call(mw, "/memory/u", "Bearer generated")).toBe(200);
    expect(call(mw, "/memory/u")).toBe(401);
    chmodSync(locked, 0o700);
  });

  it("prefers the token the user set over a generated one", () => {
    const mw = createAuthMiddleware("mine", { token: "generated", confirmedPath: join(dir, "c") });
    expect(call(mw, "/memory/u")).toBe(401);
    expect(call(mw, "/memory/u", "Bearer generated")).toBe(403);
    expect(call(mw, "/memory/u", "Bearer mine")).toBe(200);
  });
});
