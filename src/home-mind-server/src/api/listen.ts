import type { Express } from "express";
import type { Server } from "node:http";

/**
 * Start listening, or stop the process if the port can't be used.
 *
 * Express 5 hands a listen error (a port already in use, say) to the callback
 * instead of throwing it. A callback that ignores the error announces a server
 * that never answers, while the process keeps running and nothing restarts it.
 * Exiting lets Docker or s6 restart it and puts the reason in the log.
 */
export function listenOrExit(
  app: Express,
  port: number,
  onReady: () => void,
  exit: (code: number) => never = process.exit
): Server {
  return app.listen(port, (error?: Error) => {
    if (error) {
      console.error(`[server] Could not listen on port ${port}: ${error.message}`);
      exit(1);
      return;
    }
    onReady();
  });
}
