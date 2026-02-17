import type { Request, Response, NextFunction } from "express";

/**
 * Creates a bearer token auth middleware.
 * When token is undefined, all requests pass through (backward compat with HA integration).
 * When token is set, requests must include "Authorization: Bearer <token>".
 * Health endpoint is always public.
 */
export function createAuthMiddleware(
  token: string | undefined
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    // No token configured = no auth enforced
    if (!token) {
      return next();
    }

    // Health endpoint is always public
    if (req.path === "/health") {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }

    const provided = authHeader.slice(7);
    if (provided !== token) {
      return res.status(403).json({ error: "Invalid API token" });
    }

    next();
  };
}
