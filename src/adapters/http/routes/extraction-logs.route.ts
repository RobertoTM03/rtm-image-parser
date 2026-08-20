import type { FastifyInstance } from "fastify";
import type { ExtractionLogRepositoryPort } from "../../../domain/ports/extraction-log-repository.port";
import { toExtractionLogDto } from "../dto/extraction-log.dto";

const DEFAULT_PAGE_SIZE = 10;

export function registerExtractionLogsRoute(
  app: FastifyInstance,
  extractionLogRepository: ExtractionLogRepositoryPort,
  maxPageSize: number,
): void {
  app.get<{ Querystring: { limit?: string; offset?: string } }>("/v1/extraction-logs", async (request, reply) => {
    const requestedLimit = Number(request.query.limit);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, maxPageSize) : DEFAULT_PAGE_SIZE;

    const requestedOffset = Number(request.query.offset);
    const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

    const page = await extractionLogRepository.findRecent(limit, offset);
    reply.send({ logs: page.logs.map(toExtractionLogDto), hasMore: page.hasMore });
  });
}
