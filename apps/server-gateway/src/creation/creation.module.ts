// =============================================================================
// TikStream AI — Creation Module
// =============================================================================

import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { MaterialModule } from '../material/material.module';
import { ScriptModule } from '../script/script.module';
import { ProductModule } from '../product/product.module';
import { SubtitleModule } from '../subtitle/subtitle.module';
import { OriginalityModule } from '../originality/originality.module';
import { AsrSubtitleModule } from '../asr-subtitle/asr-subtitle.module';
import { CreationController } from './creation.controller';
import { InternalCreationController } from './internal-creation.controller';
import { CreationService } from './creation.service';
import { CreationRepository } from './creation.repository';
import { CreationTemplateService } from './creation-template.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { DoubaoVisionProvider } from '../../services/ai/doubao-vision.provider';
import { ProductUrlParserProvider } from '../../services/ai/product-url-parser.provider';
import { ProductRecognitionProvider } from '../../services/ai/product-recognition.provider';

@Module({
  imports: [PrismaModule, MaterialModule, ScriptModule, ProductModule, SubtitleModule, OriginalityModule, AsrSubtitleModule],
  controllers: [CreationController, InternalCreationController],
  providers: [
    CreationService,
    CreationRepository,
    CreationTemplateService,
    DoubaoTextProvider,
    DoubaoVisionProvider,
    ProductUrlParserProvider,
    ProductRecognitionProvider,
  ],
  exports: [CreationService, CreationRepository],
})
export class CreationModule {}
