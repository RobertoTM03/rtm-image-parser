import type { FastifyInstance } from "fastify";
import type { ExtractionLogRepositoryPort } from "../../../domain/ports/extraction-log-repository.port";
import { toExtractionLogDto } from "../dto/extraction-log.dto";

const MAX_HISTORY_LIMIT = 10;

export function registerExtractionLogsRoute(app: FastifyInstance, extractionLogRepository: ExtractionLogRepositoryPort): void {
  app.get<{ Querystring: { limit?: string } }>("/v1/extraction-logs", async (request, reply) => {
    const requested = Number(request.query.limit);
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_HISTORY_LIMIT) : MAX_HISTORY_LIMIT;

    const records = await extractionLogRepository.findRecent(limit);
    reply.send({ logs: records.map(toExtractionLogDto) });
  });
}
