import { HttpException } from '@nestjs/common';

type ServiceExceptionPayload = {
  message: string;
  error: {
    code: string;
    details?: unknown;
    retryable?: boolean;
  };
};

export type ServiceException = HttpException & {
  code: string;
  errorCode: string;
  statusCode: number;
  details?: unknown;
  retryable: boolean;
};

/**
 * 根据 HTTP 状态码推断错误是否可重试。
 * 5xx 服务端错误、429 限流、408 超时默认可重试；
 * 4xx 客户端错误（不含 408/429）默认不可重试。
 */
function inferRetryable(statusCode: number): boolean {
  return statusCode >= 500 || statusCode === 429 || statusCode === 408;
}

export function serviceException(
  payload: ServiceExceptionPayload,
  statusCode: number,
): ServiceException {
  return Object.assign(new HttpException(payload, statusCode), {
    code: payload.error.code,
    errorCode: payload.error.code,
    statusCode,
    details: payload.error.details,
    retryable: payload.error.retryable ?? inferRetryable(statusCode),
  });
}
