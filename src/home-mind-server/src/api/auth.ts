import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A token the add-on or deploy script generated, rather than one the user set.
 *
 * Enforcing it from the first start would lock out every integration set up
 * before it existed, so it is enforced from the first request that carries
 * it: that proves the integration has it. The moment is written to
 * `confirmedPath` and enforcement survives restarts from then on. Until then
 * the API behaves as it always has, and `onPending` lets the server tell the
 * user that it is not protected yet.
 */
export interface AutomaticToken {
  token: string;
  confirmedPath: string;
  onConfirmed?: () => void;
}

function matches(provided: string, token: string): boolean {
  const providedBuf = Buffer.from(provided);
  const tokenBuf = Buffer.from(token);
  return providedBuf.length === tokenBuf.length && timingSafeEqual(providedBuf, tokenBuf);
}

/** Whether an automatic token is enforced already. */
export function automaticTokenConfirmed(auto: AutomaticToken): boolean {
  return existsSync(auto.confirmedPath);
}

/**
 * Creates a bearer token auth middleware.
 *
 * - `token` (API_TOKEN, set by the user): every request except the health
 *   check must carry it, from the first start.
 * - `auto` (API_TOKEN_AUTO, generated): the same once confirmed; before that,
 *   requests without a token pass and the first one with the right token
 *   confirms it. A wrong token is refused either way.
 * - Neither: every request passes.
 */
export function createAuthMiddleware(
  token: string | undefined,
  auto?: AutomaticToken
): (req: Request, res: Response, next: NextFunction) => void {
  const expected = token ?? auto?.token;
  let enforced = token !== undefined || (auto !== undefined && automaticTokenConfirmed(auto));

  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) return next();

    // Health endpoint is always public
    if (req.path === "/health") return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (!enforced) return next();
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    if (!matches(authHeader.slice(7), expected)) {
      return res.status(403).json({ error: "Invalid API token" });
    }

    if (!enforced && auto) {
      try {
        mkdirSync(dirname(auto.confirmedPath), { recursive: true });
        writeFileSync(auto.confirmedPath, `${new Date().toISOString()}\n`, { mode: 0o600 });
      } catch (err) {
        // Enforced for this run regardless; the next start will wait for the
        // token again, which only delays protection, never locks anyone out.
        console.warn(`[auth] Could not record the API token as confirmed: ${String(err)}`);
      }
      enforced = true;
      console.log("[auth] The integration uses the API token: requests without it are refused from now on");
      auto.onConfirmed?.();
    }
    next();
  };
}
