import { Module } from '@nestjs/common';
import { AsrSubtitleService } from './asr-subtitle.service';

@Module({
  providers: [AsrSubtitleService],
  exports: [AsrSubtitleService],
})
export class AsrSubtitleModule {}
