import { Module } from '@nestjs/common';
import { MaterialModule } from '../material/material.module';
import { OriginalityService } from './originality.service';

@Module({
  imports: [MaterialModule],
  providers: [OriginalityService],
  exports: [OriginalityService],
})
export class OriginalityModule {}
