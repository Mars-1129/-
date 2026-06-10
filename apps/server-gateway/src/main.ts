// --- OpenTelemetry 链路追踪（必须在所有业务模块之前初始化）---
// 使用动态 require 避免 Node.js 22 CJS/ESM 不兼容导致整个服务启动失败
try {
  require('./tracing');
} catch (error: unknown) {
  const errMsg = error instanceof Error ? error.message : String(error);
  console.warn(`[server-gateway] OpenTelemetry initialization failed (non-fatal): ${errMsg}`);
  console.warn('[server-gateway] Continuing without distributed tracing');
}

import { resolve } from 'node:path';
import { findWorkspaceRoot, loadWorkspaceEnv, resolveFirstExistingPath } from './workspace-root';

const workspaceRoot = loadWorkspaceEnv();

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { MetricsService } from './metrics/metrics.service';
import { TraceInterceptor } from './common/trace.interceptor';

function resolveDemoAssetsDir(): string {
  if (process.env.ASSETS_DEMO_DIR) {
    return process.env.ASSETS_DEMO_DIR;
  }

  return resolveFirstExistingPath([
    resolve(workspaceRoot, 'assets/demo'),
    resolve(process.cwd(), 'assets/demo'),
    resolve(process.cwd(), '../../assets/demo'),
  ]);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // HTTP metrics interceptor
  const metricsService = app.get(MetricsService);
  app.use((req: any, res: any, next: () => void) => {
    const start = Date.now();
    const originalEnd = res.end;
    res.end = function (...args: any[]) {
      const duration = (Date.now() - start) / 1000;
      const method = req.method || 'UNKNOWN';
      const path = req.route?.path || req.path || 'UNKNOWN';
      const status = res.statusCode || 200;
      metricsService.httpRequestsTotal.inc({ method, path, status: String(status) });
      metricsService.httpRequestDurationSeconds.observe({ method, path }, duration);
      return originalEnd.apply(res, args);
    };
    next();
  });

  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : (process.env.NODE_ENV === 'production' ? false : true);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalInterceptors(new TraceInterceptor());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  const demoAssetsDir = resolveDemoAssetsDir();
  console.log(`[server-gateway] Demo static assets: ${demoAssetsDir}`);
  app.useStaticAssets(demoAssetsDir, {
    prefix: '/api/v1/demo/',
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    },
  });

  try {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TikStream AI API')
      .setDescription('TikStream AI server gateway API')
      .setVersion('1.0.0')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    console.log('[server-gateway] Swagger docs available at /api/docs');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[server-gateway] Swagger bootstrap failed: ${errMsg}`);
    console.warn('[server-gateway] API docs will NOT be available at /api/docs');
  }

  const port = Number(process.env.PORT || 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`[server-gateway] Listening on http://localhost:${port} (health: /health, docs: /api/docs)`);
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap server-gateway', error);
  process.exit(1);
});
