import { Injectable, Logger } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Gauge, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly register: Registry;

  // HTTP metrics
  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDurationSeconds: Histogram<string>;

  // Script generation
  readonly scriptGenerateDurationSeconds: Histogram<string>;

  // Creation
  readonly creationRequestsTotal: Counter<string>;
  readonly creationStageTransitionsTotal: Counter<string>;
  readonly creationFailuresTotal: Counter<string>;

  constructor() {
    this.register = new Registry();
    collectDefaultMetrics({ register: this.register, prefix: 'tikstream_' });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'path', 'status'],
      registers: [this.register],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'path'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.register],
    });

    this.scriptGenerateDurationSeconds = new Histogram({
      name: 'script_generate_duration_seconds',
      help: 'Script generation duration in seconds',
      labelNames: ['mode'],
      buckets: [1, 2, 5, 10, 15, 30, 60, 120, 300],
      registers: [this.register],
    });

    this.creationRequestsTotal = new Counter({
      name: 'creation_requests_total',
      help: 'Total creation requests',
      labelNames: ['engine_mode'],
      registers: [this.register],
    });

    this.creationStageTransitionsTotal = new Counter({
      name: 'creation_stage_transitions_total',
      help: 'Total creation stage transitions',
      labelNames: ['stage'],
      registers: [this.register],
    });

    this.creationFailuresTotal = new Counter({
      name: 'creation_failures_total',
      help: 'Total creation failures',
      labelNames: ['error_code'],
      registers: [this.register],
    });
  }

  async getMetrics(): Promise<string> {
    try {
      return await this.register.metrics();
    } catch (error) {
      this.logger.error(`Metrics serialization failed: ${(error as Error).message}`);
      return '# Metrics temporarily unavailable\n';
    }
  }
}
