import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { StatsService } from './stats.service';

@Controller('api/internal/v1')
export class InternalStatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('stats/resources')
  @HttpCode(HttpStatus.OK)
  async getResourceStats() {
    const data = await this.statsService.getResourceStats();
    return { success: true, data, trace_id: '' };
  }
}
