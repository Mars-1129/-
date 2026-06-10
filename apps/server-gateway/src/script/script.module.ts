// =============================================================================
// TikStream AI — Script Module
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { ProductModule } from '../product/product.module';
import { ViralAnalysisModule } from '../viral-analysis/viral-analysis.module';
import { TemplateModule } from '../template/template.module';
import { ConstraintModule } from '../constraint/constraint.module';
import { SubtitleModule } from '../subtitle/subtitle.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MaterialModule } from '../material/material.module';
import { ScriptController } from './script.controller';
import { ScriptVersionController } from './script-version.controller';
import { ScriptService } from './script.service';
import { ScriptRepository } from './script.repository';
import { ScriptVersionService } from './script-version.service';
import { ScriptSchemaValidator } from './script-schema.validator';
import { ComplianceFilter } from './compliance.filter';
import { SensitivityChecker } from './sensitivity/sensitivity-checker';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { ScriptQuickPromptBuilder } from '../../services/prompts/script-quick.prompt';
import { ScriptViralRewritePromptBuilder } from '../../services/prompts/script-viral-rewrite.prompt';
import { ScriptTemplatePromptBuilder } from '../../services/prompts/script-template.prompt';
import { RegenerateScriptPromptBuilder } from '../../services/prompts/regenerate-script.prompt';
import { RestyleScriptPromptBuilder } from '../../services/prompts/restyle-script.prompt';
import { PatchSuggestPromptBuilder } from '../../services/prompts/patch-suggest.prompt';
import { FactorRemixPromptBuilder } from '../../services/prompts/regenerate-factor-remix.prompt';
import { ComplianceAiReviewPromptBuilder } from '../../services/prompts/compliance-ai-review.prompt';

@Module({
  imports: [PrismaModule, ProductModule, forwardRef(() => ViralAnalysisModule), forwardRef(() => TemplateModule), forwardRef(() => ConstraintModule), AnalyticsModule, SubtitleModule, forwardRef(() => MaterialModule)],
  controllers: [ScriptController, ScriptVersionController],
  providers: [
    ScriptService,
    ScriptRepository,
    ScriptVersionService,
    ScriptSchemaValidator,
    ComplianceFilter,
    SensitivityChecker,
    DoubaoTextProvider,
    ScriptQuickPromptBuilder,
    ScriptViralRewritePromptBuilder,
    ScriptTemplatePromptBuilder,
    RegenerateScriptPromptBuilder,
    RestyleScriptPromptBuilder,
    PatchSuggestPromptBuilder,
    FactorRemixPromptBuilder,
    ComplianceAiReviewPromptBuilder,
  ],
  exports: [ScriptService, ScriptRepository, ComplianceFilter, SensitivityChecker, ScriptQuickPromptBuilder, ScriptSchemaValidator],
})
export class ScriptModule {}
