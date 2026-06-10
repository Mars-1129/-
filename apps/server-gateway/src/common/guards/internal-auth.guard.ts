// =============================================================================
// TikStream AI — Internal Auth Guard
// 保护 Worker → Gateway 内部回调接口免受未授权访问
// =============================================================================

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  HttpStatus,
} from '@nestjs/common';
import { HttpException } from '@nestjs/common';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  /** 预期的共享密钥（由环境变量配置，未配置时仅拒绝无 token 的请求） */
  private readonly expectedToken = process.env.INTERNAL_API_TOKEN || null;

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-internal-token'] as string | undefined;

    // 未配置 INTERNAL_API_TOKEN 时拒绝所有请求（fail-secure）
    if (!this.expectedToken) {
      this.logger.error(
        '[InternalAuth] INTERNAL_API_TOKEN 未配置 — 拒绝所有内部 API 请求',
      );
      throw new HttpException(
        {
          success: false,
          message: '内部服务配置错误',
          error: { code: 'INTERNAL_CONFIG_ERROR', retryable: false },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!token || token !== this.expectedToken) {
      this.logger.warn(
        `[InternalAuth] 拒绝未授权请求 — ip=${request.ip} token=${token ? 'present-but-invalid' : 'missing'}`,
      );
      throw new HttpException(
        {
          success: false,
          message: '未授权的内部 API 访问',
          error: { code: 'UNAUTHORIZED', retryable: false },
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return true;
  }
}
