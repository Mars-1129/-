// =============================================================================
// TikStream AI — Trend Tracker Module
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { TrendTrackerController } from './trend-tracker.controller';
import { TrendTrackerService } from './trend-tracker.service';
import { TrendTrackerRepository } from './trend-tracker.repository';
import { TrendTrackerPromptBuilder } from './trend-tracker.prompt-builder';
import { TrendEngineService } from './trend-engine.service';
import {
  TrendScoringService,
  ProductMatchingService,
  TrendVelocityService,
  OpportunityRankingService,
} from './algorithms';
import { TrendMockDataService } from './trend-mock-data.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ViralAnalysisModule } from '../viral-analysis/viral-analysis.module';

@Module({
  imports: [PrismaModule, ViralAnalysisModule],
  controllers: [TrendTrackerController],
  providers: [
    TrendTrackerService,
    TrendTrackerRepository,
    TrendTrackerPromptBuilder,
    DoubaoTextProvider,
    // Algorithm Engine
    TrendEngineService,
    TrendScoringService,
    ProductMatchingService,
    TrendVelocityService,
    OpportunityRankingService,
    // Mock Data
    TrendMockDataService,
  ],
  exports: [TrendTrackerService, TrendEngineService],
})
export class TrendTrackerModule {}
