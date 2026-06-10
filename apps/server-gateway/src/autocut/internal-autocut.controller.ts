import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AutocutService } from './autocut.service';

@Controller('api/internal/v1/autocut')
export class AutocutInternalController {
  constructor(private readonly service: AutocutService) {}

  @Post('transcript-ready')
  @HttpCode(HttpStatus.OK)
  async transcriptReady(@Body() body: {
    job_id: string;
    segments: Array<{
      index: number;
      start_sec: number;
      end_sec: number;
      text: string;
      selected: boolean;
    }>;
    srt_content: string;
    language: string;
    video_duration: number;
  }) {
    return this.service.handleTranscriptReady(body);
  }

  @Post('cut-complete')
  @HttpCode(HttpStatus.OK)
  async cutComplete(@Body() body: {
    job_id: string;
    output_url: string;
  }) {
    return this.service.handleCutComplete(body);
  }

  @Post('job-failed')
  @HttpCode(HttpStatus.OK)
  async jobFailed(@Body() body: {
    job_id: string;
    error: string;
  }) {
    return this.service.handleJobFailed(body);
  }

  @Get('job/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    return this.service.getJobInternal(jobId);
  }
}
