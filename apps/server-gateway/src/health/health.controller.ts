import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly doubaoProvider: DoubaoTextProvider,
  ) {}

  @Get()
  checkHealth() {
    // 基础存活检查：仅验证 NestJS 服务可达
    // 数据库级别的健康检查通过 /health/db 提供
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  checkDb() {
    return this.healthService.checkHealth();
  }

  @Get('ai')
  async checkAiHealth() {
    const result = await this.doubaoProvider.checkHealth();
    return {
      status: result.ok ? 'ok' : 'error',
      provider: 'doubao-ark',
      ...result,
      timestamp: new Date().toISOString(),
    };
  }
}
