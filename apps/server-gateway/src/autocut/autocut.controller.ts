import { Controller, Post, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { AutocutService } from './autocut.service';
import { SubmitAutocutDto } from './dto/submit-autocut.dto';
import { UpdateSegmentsDto } from './dto/cut-autocut.dto';

@Controller('api/v1/autocut')
export class AutocutController {
  constructor(private readonly service: AutocutService) {}

  @Post('submit')
  async submit(@Body() dto: SubmitAutocutDto) {
    return this.service.submitTranscribe(dto);
  }

  @Get('jobs')
  async listJobs(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.service.listJobs({ status, limit: limit ? Number(limit) : 20 });
  }

  @Get('transcript/:jobId')
  async getTranscript(@Param('jobId') jobId: string) {
    return this.service.getTranscript(jobId);
  }

  @Patch('transcript/:jobId')
  async updateSegments(@Param('jobId') jobId: string, @Body() dto: UpdateSegmentsDto) {
    return this.service.updateSegments(jobId, dto);
  }

  @Post('cut/:jobId')
  async executeCut(@Param('jobId') jobId: string) {
    return this.service.executeCut(jobId);
  }

  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string) {
    return this.service.getStatus(jobId);
  }
}
