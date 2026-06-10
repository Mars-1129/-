/**
 * 全局链路追踪拦截器
 *
 * 职责：
 *  1. 为每个 HTTP 请求自动注入 trace_id（基于 OTel SpanContext）
 *  2. 在响应体中审计 trace_id 是否存在：缺失则注入，已有则保持
 *  3. 设置 X-Trace-Id 响应头供前端消费
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';
import { context, trace } from '@opentelemetry/api';

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TraceInterceptor.name);

  intercept(executionContext: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = executionContext.switchToHttp();
    const req = httpCtx.getRequest<Request>();
    const res = httpCtx.getResponse<Response>();

    // SSE 端点不修改响应头，直接从 handler 返回原始 stream
    const acceptHeader = Array.isArray(req.headers['accept'])
      ? req.headers['accept'].join(', ')
      : (req.headers['accept'] || '');
    const isSSE = acceptHeader.includes('text/event-stream')
      || req.path.includes('/stream')
      || req.path.includes('/events');

    if (isSSE) {
      return next.handle();
    }

    // 优先使用活跃 Span 的 traceId，否则回退到 randomUUID()
    const activeSpan = trace.getSpan(context.active());
    const traceId = activeSpan?.spanContext().traceId || crypto.randomUUID();

    // 注入到 response locals，方便 Controller/Service 按需读取
    res.locals = res.locals || {};
    res.locals.traceId = traceId;

    // 设置响应头
    res.setHeader('X-Trace-Id', traceId);

    // 记录请求入口
    const startMs = Date.now();
    this.logger.debug(`REQ ${req.method} ${req.path} trace=${traceId}`);

    return next.handle().pipe(
      map((data) => {
        const elapsedMs = Date.now() - startMs;
        this.logger.debug(`RES ${req.method} ${req.path} trace=${traceId} ${elapsedMs}ms`);

        // 审计响应体：如果已经有 trace_id 则保持原样，否则注入
        if (data && typeof data === 'object' && !('trace_id' in data)) {
          try {
            (data as Record<string, unknown>).trace_id = traceId;
          } catch {
            this.logger.warn(
              `Cannot inject trace_id into response body (object may be frozen/sealed) for ${req.method} ${req.path}`,
            );
          }
        }

        return data;
      }),
    );
  }
}
