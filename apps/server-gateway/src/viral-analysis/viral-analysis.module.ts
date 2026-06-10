// =============================================================================
// TikStream AI — Viral Video Analysis Module
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { ScheduleModule } from '@nestjs/schedule';
import { ProductModule } from '../product/product.module';
import { ScriptModule } from '../script/script.module';
import { ViralAnalysisController } from './viral-analysis.controller';
import { ViralDnaController } from './viral-dna.controller';
import { ViralAnalysisService } from './viral-analysis.service';
import { ViralAnalysisRepository } from './viral-analysis.repository';
import { ViralDnaService } from './viral-dna.service';
import { ViralDnaRepository } from './viral-dna.repository';
import { ViralSubscriptionService } from './viral-subscription.service';
import { ViralVideoAnalysisProvider } from '../../services/ai/viral-video-analysis.provider';
import { ViralVideoAnalysisPromptBuilder } from '../../services/prompts/video-analysis.prompt';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { DoubaoVisionProvider } from '../../services/ai/doubao-vision.provider';

@Module({
  imports: [PrismaModule, ProductModule, forwardRef(() => ScriptModule), ScheduleModule.forRoot()],
  controllers: [ViralAnalysisController, ViralDnaController],
  providers: [
    ViralAnalysisService,
    ViralAnalysisRepository,
    ViralDnaService,
    ViralDnaRepository,
    ViralSubscriptionService,
    ViralVideoAnalysisProvider,
    ViralVideoAnalysisPromptBuilder,
    DoubaoTextProvider,
    DoubaoVisionProvider,
  ],
  exports: [ViralAnalysisService, ViralAnalysisRepository],
})
export class ViralAnalysisModule {}
