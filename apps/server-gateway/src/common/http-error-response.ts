import { HttpException } from '@nestjs/common';
import { ApiErrorDetail, ApiErrorResponse } from '@tikstream/shared-types';

type ErrorPayload = {
  code?: string;
  details?: ApiErrorDetail[];
  retryable?: boolean;
};

type HttpExceptionPayload = {
  message?: string;
  error?: ErrorPayload;
};

export function buildApiErrorResponse(error: unknown, traceId: string): ApiErrorResponse {
  if (error instanceof HttpException) {
    const rawResponse = error.getResponse();
    const response = normalizeHttpExceptionPayload(rawResponse);

    return {
      success: false,
      message: response.message || '内部服务器错误',
      error: {
        code: response.error?.code || 'INTERNAL_SERVER_ERROR',
        details: response.error?.details,
        retryable: response.error?.retryable ?? false,
      },
      trace_id: traceId,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    success: false,
    message: '内部服务器错误',
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      retryable: false,
    },
    trace_id: traceId,
    timestamp: new Date().toISOString(),
  };
}

function normalizeHttpExceptionPayload(rawResponse: string | object): HttpExceptionPayload {
  if (typeof rawResponse === 'string') {
    return { message: rawResponse };
  }

  const payload = rawResponse as Record<string, unknown>;
  const rawError = payload.error;
  const errorPayload = isRecord(rawError) ? rawError : undefined;

  return {
    message: typeof payload.message === 'string' ? payload.message : undefined,
    error: errorPayload
      ? {
          code: typeof errorPayload.code === 'string' ? errorPayload.code : undefined,
          details: Array.isArray(errorPayload.details) ? errorPayload.details as ApiErrorDetail[] : undefined,
          retryable: typeof errorPayload.retryable === 'boolean' ? errorPayload.retryable : undefined,
        }
      : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
