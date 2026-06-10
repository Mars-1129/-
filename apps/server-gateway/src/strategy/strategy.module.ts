// =============================================================================
// TikStream AI — Strategy Module
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyRepository } from './strategy.repository';

@Module({
  imports: [PrismaModule],
  controllers: [StrategyController],
  providers: [StrategyService, StrategyRepository],
  exports: [StrategyService, StrategyRepository],
})
export class StrategyModule {}
