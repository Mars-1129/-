// =============================================================================
// TikStream AI — Factor Module
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { FactorController } from './factor.controller';
import { FactorService } from './factor.service';
import { FactorRepository } from './factor.repository';

@Module({
  imports: [PrismaModule],
  controllers: [FactorController],
  providers: [FactorService, FactorRepository],
  exports: [FactorService, FactorRepository],
})
export class FactorModule {}
