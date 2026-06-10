// =============================================================================
// TikStream AI — Subtitle Module
// =============================================================================

import { Module } from '@nestjs/common';
import { SubtitleController } from './subtitle.controller';
import { SubtitleTranslationService } from './subtitle-translation.service';
import { PrismaService } from '@nestjs/prisma';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';

@Module({
  controllers: [SubtitleController],
  providers: [SubtitleTranslationService, PrismaService, DoubaoTextProvider],
  exports: [SubtitleTranslationService],
})
export class SubtitleModule {}
