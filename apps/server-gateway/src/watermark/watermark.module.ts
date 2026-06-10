// =============================================================================
// TikStream AI — Watermark Module
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { WatermarkController } from './watermark.controller';
import { WatermarkService } from './watermark.service';

@Module({
  imports: [PrismaModule],
  controllers: [WatermarkController],
  providers: [WatermarkService],
  exports: [WatermarkService],
})
export class WatermarkModule {}
