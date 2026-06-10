// =============================================================================
// TikStream AI — Posting Time Module
// 投放时段优化 NestJS 模块
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { PostingTimeController } from './posting-time.controller';
import { PostingTimeService } from './posting-time.service';

@Module({
  imports: [PrismaModule],
  controllers: [PostingTimeController],
  providers: [PostingTimeService],
  exports: [PostingTimeService],
})
export class PostingTimeModule {}
