// =============================================================================
// TikStream AI — Agent Module
// LangGraph Agent NestJS 模块
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { ScriptModule } from '../script/script.module';
import { ProductModule } from '../product/product.module';
import { MaterialModule } from '../material/material.module';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { MultiAgentModule } from './multi-agent/multi-agent.module';

@Module({
  imports: [PrismaModule, ScriptModule, ProductModule, MultiAgentModule, forwardRef(() => MaterialModule)],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService, MultiAgentModule],
})
export class AgentModule {}
