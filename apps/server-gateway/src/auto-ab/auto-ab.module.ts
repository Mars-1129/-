// =============================================================================
// TikStream AI — Auto A/B Module
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { ScriptModule } from '../script/script.module';
import { CreationModule } from '../creation/creation.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { MaterialModule } from '../material/material.module';
import { AutoAbController } from './auto-ab.controller';
import { AutoAbPipelineService } from './auto-ab-pipeline.service';

@Module({
  imports: [ScriptModule, CreationModule, AnalyticsModule, forwardRef(() => MaterialModule)],
  controllers: [AutoAbController],
  providers: [AutoAbPipelineService],
  exports: [AutoAbPipelineService],
})
export class AutoAbModule {}
