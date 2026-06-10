// =============================================================================
// TikStream AI — Template Module
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';
import { TemplateRepository } from './template.repository';
import { ScriptModule } from '../script/script.module';
import { ViralAnalysisModule } from '../viral-analysis/viral-analysis.module';
import { FactorModule } from '../factor/factor.module';
import { StrategyModule } from '../strategy/strategy.module';
import { ConstraintModule } from '../constraint/constraint.module';
import { ClusterTemplateProvider } from '../../services/ai/cluster-template.provider';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';

@Module({
  imports: [PrismaModule, forwardRef(() => ScriptModule), ViralAnalysisModule, FactorModule, StrategyModule, ConstraintModule],
  controllers: [TemplateController],
  providers: [TemplateService, TemplateRepository, ClusterTemplateProvider, DoubaoTextProvider],
  exports: [TemplateService, TemplateRepository],
})
export class TemplateModule {}
