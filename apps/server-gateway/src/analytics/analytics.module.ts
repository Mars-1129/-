// =============================================================================
// TikStream AI — Analytics Module
// NestJS DI 模块注册
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { ViralAnalysisModule } from '../viral-analysis/viral-analysis.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';
import { AutoAbService } from './auto-ab.service';
import { ColdStartService } from './cold-start.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';

@Module({
  imports: [PrismaModule, ViralAnalysisModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository, AutoAbService, ColdStartService, DoubaoTextProvider],
  exports: [AnalyticsService, AutoAbService, ColdStartService],
})
export class AnalyticsModule {}
