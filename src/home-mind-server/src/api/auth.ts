import type { Request, Response, NextFunction } from "express";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * A token the add-on or deploy script generated, rather than one the user set.
 *
 * Enforcing it from the first start would lock out every integration set up
 * before it existed, so it is enforced from the first request that carries
 * it: that proves the integration has it. A fingerprint of the token is
 * written to `confirmedPath` (scrypt, in case the token is one a person chose), so enforcement survives restarts, and a new
 * token starts out unconfirmed again. Until then the API behaves as it always
 * has.
 */
export interface AutomaticToken {
  token: string;
  confirmedPath: string;
  onConfirmed?: () => void;
}

/** A middleware that can also say whether it refuses requests without the token right now. */
export interface AuthMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
  enforced(): boolean;
}

function matches(provided: string, token: string): boolean {
  const providedBuf = Buffer.from(provided);
  const tokenBuf = Buffer.from(token);
  return providedBuf.length === tokenBuf.length && timingSafeEqual(providedBuf, tokenBuf);
}

/** What is stored to say which token is in use; the token itself never is. */
function fingerprint(token: string): string {
  return scryptSync(token, "home-mind-api-token", 32).toString("hex");
}

/** Whether this automatic token was confirmed on an earlier run. */
export function automaticTokenConfirmed(auto: AutomaticToken): boolean {
  try {
    return readFileSync(auto.confirmedPath, "utf8").trim() === fingerprint(auto.token);
  } catch {
    return false;
  }
}

/** Whether the confirmation can be recorded; if not, it would hold only until the next restart. */
function stateDirectoryWritable(auto: AutomaticToken): boolean {
  try {
    mkdirSync(dirname(auto.confirmedPath), { recursive: true });
    accessSync(dirname(auto.confirmedPath), constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const BEARER = /^Bearer\s+(\S+)$/i;

/**
 * Set to `invalid` on a request that passed with a token that is not the API
 * token, which happens only while the generated token is not in use yet. A
 * client being set up can tell the user about a typo from it; a client that
 * still holds an older token keeps working. It reveals nothing a request
 * could not get anyway while the API is open.
 */
export const TOKEN_STATUS_HEADER = "X-Home-Mind-Token";

/**
 * Creates a bearer token auth middleware.
 *
 * - `token` (API_TOKEN, set by the user): every request except the health
 *   check must carry it, from the first start.
 * - `auto` (API_TOKEN_AUTO, generated): the same once confirmed. Before that,
 *   every request passes, and the first one with the right token confirms it.
 *   A request with some other token passes too while unconfirmed: a client may
 *   still hold a token from an earlier setup, and refusing it would stop it
 *   on the day of the update without protecting anything, since leaving the
 *   header out gets in. Such a response carries `TOKEN_STATUS_HEADER`.
 * - Neither: every request passes.
 */
export function createAuthMiddleware(token: string | undefined, auto?: AutomaticToken): AuthMiddleware {
  const expected = token ?? auto?.token;
  let enforced = token !== undefined || (auto !== undefined && automaticTokenConfirmed(auto));
  let warnedOtherToken = false;

  if (auto && token === undefined && !enforced && !stateDirectoryWritable(auto)) {
    console.error(
      `[auth] Cannot write ${dirname(auto.confirmedPath)}: once the integration uses the API token, ` +
        "it is required only until the server restarts. Make that directory writable by the server " +
        "or set API_TOKEN_STATE_PATH to a path it can write."
    );
  }

  const middleware = (req: Request, res: Response, next: NextFunction) => {
    if (!expected) return next();

    // Health endpoint is always public
    if (req.path === "/health") return next();

    const provided = BEARER.exec(req.headers.authorization ?? "")?.[1];
    if (provided === undefined) {
      if (!enforced) return next();
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    if (!matches(provided, expected)) {
      if (!enforced) {
        res.setHeader(TOKEN_STATUS_HEADER, "invalid");
        if (!warnedOtherToken) {
          warnedOtherToken = true;
          console.warn(
            "[auth] A client sent a token that is not the API token; allowed until the API token is in use"
          );
        }
        return next();
      }
      return res.status(403).json({ error: "Invalid API token" });
    }

    if (!enforced && auto) {
      try {
        mkdirSync(dirname(auto.confirmedPath), { recursive: true });
        writeFileSync(auto.confirmedPath, `${fingerprint(auto.token)}\n`, { mode: 0o600 });
      } catch (err) {
        // Enforced for this run regardless; the next start will wait for the
        // token again, which only delays protection, never locks anyone out.
        console.error(`[auth] Could not record the API token as in use: ${String(err)}`);
      }
      enforced = true;
      console.log("[auth] The integration uses the API token: requests without it are refused from now on");
      auto.onConfirmed?.();
    }
    next();
  };

  return Object.assign(middleware, { enforced: () => enforced });
}
