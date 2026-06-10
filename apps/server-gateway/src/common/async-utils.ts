import { Logger } from '@nestjs/common';

/**
 * 统一的 fire-and-forget 异步调用包装器
 * 用于非阻塞副作用操作，失败时记录结构化日志便于运维排查
 *
 * 使用示例:
 *   fireAndForget(this.logger, 'indexSliceToQdrant', this.indexSliceToQdrant(sliceId));
 */
export function fireAndForget(
  logger: Logger,
  operation: string,
  promise: Promise<unknown>,
): void {
  void promise.catch((error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(
      `[fireAndForget] ${operation} failed: ${err.message}`,
      process.env.NODE_ENV === 'development' ? err.stack : undefined,
    );
  });
}
