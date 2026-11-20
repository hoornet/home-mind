import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { listenOrExit } from "./listen.js";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(() => r(undefined)))));
  vi.restoreAllMocks();
});

describe("listenOrExit", () => {
  it("announces the server once it listens", async () => {
    const ready = vi.fn();
    const server = listenOrExit(express(), 0, ready);
    servers.push(server);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
  });

  it("exits instead of announcing a server when the port is taken", async () => {
    const holder = createServer();
    servers.push(holder);
    await new Promise<void>((r) => holder.listen(0, "0.0.0.0", () => r()));
    const port = (holder.address() as AddressInfo).port;

    vi.spyOn(console, "error").mockImplementation(() => {});
    const ready = vi.fn();
    const exit = vi.fn() as unknown as (code: number) => never;
    listenOrExit(express(), port, ready, exit);

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
    expect(ready).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(`port ${port}`));
  });
});
