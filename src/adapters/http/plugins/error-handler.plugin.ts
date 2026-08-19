import type { FastifyInstance } from "fastify";
import {
  AllModelsFailedError,
  DocumentTypeAlreadyExistsError,
  DocumentTypeNotFoundError,
  TemplateNotFoundError,
} from "../../../domain/errors/domain-errors";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof DocumentTypeNotFoundError || error instanceof TemplateNotFoundError) {
      reply.code(404).send({ error: error.name, message: error.message });
      return;
    }

    if (error instanceof DocumentTypeAlreadyExistsError) {
      reply.code(409).send({ error: error.name, message: error.message });
      return;
    }

    if (error instanceof AllModelsFailedError) {
      reply.code(502).send({ error: error.name, message: error.message, reasons: error.reasons });
      return;
    }

    // Zod / Fastify body validation errors are handled inline in route handlers
    // via .safeParse and don't reach here.

    app.log.error(error);
    reply.code(500).send({ error: "InternalServerError", message: "Unexpected error" });
  });
}
