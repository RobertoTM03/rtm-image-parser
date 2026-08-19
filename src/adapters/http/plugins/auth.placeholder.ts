import type { FastifyInstance } from "fastify";

/**
 * TODO: no authentication is implemented in this phase. Wire a real
 * preHandler here (API key, JWT, etc.) when auth is added; every route
 * already goes through this hook so adding it later needs no route changes.
 */
export function registerAuthPlaceholder(app: FastifyInstance): void {
  app.addHook("preHandler", async (_request, _reply) => {
    // no-op
  });
}
