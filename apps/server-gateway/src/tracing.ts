/**
 * OpenTelemetry 链路追踪初始化
 *
 * 必须在所有业务 import 之前加载，确保 instrumentation 能正确 hook 底层模块。
 * main.ts 第一行 import 此文件。
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const JAEGER_OTLP_URL =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
  process.env.JAEGER_OTLP_URL ||
  'http://jaeger:4318/v1/traces';

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'tikstream-gateway';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
  }),

  traceExporter: new OTLPTraceExporter({
    url: JAEGER_OTLP_URL,
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      // 噪声过滤：健康检查不产生 span
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingPaths: ['/health', '/health/db', '/api/docs', '/api/docs-json'],
      },
      // PostgreSQL instrumentation 需要在父 span 存在时才创建 span（避免无上下文裸 span）
      '@opentelemetry/instrumentation-pg': {
        requireParentSpan: true,
      },
      // Redis instrumentation 过滤 PING 噪声
      '@opentelemetry/instrumentation-ioredis': {},
    }),
    new NestInstrumentation(),
  ],
});

sdk.start();

console.log(`[tracing] OpenTelemetry SDK started (service=${SERVICE_NAME}, exporter=${JAEGER_OTLP_URL})`);

// 优雅关闭
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('[tracing] SDK shut down'))
    .catch((err) => console.error('[tracing] SDK shutdown error', err))
    .finally(() => process.exit(0));
});
