// =============================================================================
// TikStream AI — Constraint Module
// =============================================================================

import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { ConstraintController } from './constraint.controller';
import { ConstraintService } from './constraint.service';
import { ConstraintRepository } from './constraint.repository';
import { ScriptModule } from '../script/script.module';

@Module({
  imports: [PrismaModule, forwardRef(() => ScriptModule)],
  controllers: [ConstraintController],
  providers: [ConstraintService, ConstraintRepository],
  exports: [ConstraintService, ConstraintRepository],
})
export class ConstraintModule {}
