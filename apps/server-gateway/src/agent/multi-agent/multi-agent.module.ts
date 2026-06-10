// =============================================================================
// TikStream AI — Multi-Agent Module
// 多 Agent 协作系统 NestJS 模块
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { ScriptModule } from '../../script/script.module';
import { ProductModule } from '../../product/product.module';
import { MaterialModule } from '../../material/material.module';
import { MultiAgentController } from './multi-agent.controller';
import { MultiAgentOrchestratorService } from './orchestrator.service';

@Module({
  imports: [ScriptModule, ProductModule, forwardRef(() => MaterialModule)],
  controllers: [MultiAgentController],
  providers: [MultiAgentOrchestratorService],
  exports: [MultiAgentOrchestratorService],
})
export class MultiAgentModule {}
