// =============================================================================
// TikStream AI — Subtitle Controller
// =============================================================================

import { Controller, Post, Get, Delete, Param, Query, Body, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Response } from 'express';
import { SubtitleTranslationService } from './subtitle-translation.service';
import { TranslateScriptDto } from './dto/translate-subtitles.dto';

@ApiTags('Subtitles')
@Controller('api/v1/scripts/:scriptId')
export class SubtitleController {
  constructor(private readonly subtitleService: SubtitleTranslationService) {}

  @Post('translations')
  @ApiOperation({ summary: '触发字幕翻译' })
  async translate(
    @Param('scriptId') scriptId: string,
    @Body() dto?: TranslateScriptDto,
  ) {
    const result = await this.subtitleService.translateScript(scriptId, dto?.target_langs);
    return {
      success: true,
      message: `Translated ${result.translated_count} subtitle entries`,
      data: result,
    };
  }

  @Get('translations')
  @ApiOperation({ summary: '获取所有字幕翻译' })
  async getTranslations(@Param('scriptId') scriptId: string) {
    const data = await this.subtitleService.getTranslations(scriptId);
    return { success: true, data };
  }

  @Delete('translations')
  @ApiOperation({ summary: '清除字幕翻译缓存' })
  async invalidate(@Param('scriptId') scriptId: string) {
    const data = await this.subtitleService.invalidateTranslations(scriptId);
    return { success: true, message: `Deleted ${data.deleted_count} translations`, data };
  }

  @Post('shots/:shotIndex/translations')
  @ApiOperation({ summary: '翻译单个分镜' })
  async translateShot(
    @Param('scriptId') scriptId: string,
    @Param('shotIndex') shotIndex: number,
    @Body() dto?: TranslateScriptDto,
  ) {
    const result = await this.subtitleService.translateShot(scriptId, shotIndex, dto?.target_langs);
    return {
      success: true,
      message: `Translated ${result.translated_count} entries`,
      data: result,
    };
  }

  @Get('subtitles/:targetLang.:format')
  @ApiOperation({ summary: '导出字幕文件' })
  @ApiParam({ name: 'targetLang', description: '目标语种 (en-US/id-ID/th-TH/vi-VN/ms-MY)' })
  @ApiParam({ name: 'format', description: '字幕格式 (srt/vtt/ass)' })
  async downloadSubtitle(
    @Param('scriptId') scriptId: string,
    @Param('targetLang') targetLang: string,
    @Param('format') format: string,
    @Res() res: Response,
  ) {
    const content = await this.subtitleService.buildSubtitleFile(
      scriptId,
      targetLang,
      format as 'srt' | 'vtt' | 'ass',
    );

    const contentTypeMap: Record<string, string> = {
      srt: 'text/plain; charset=utf-8',
      vtt: 'text/vtt; charset=utf-8',
      ass: 'text/plain; charset=utf-8',
    };

    res.setHeader('Content-Type', contentTypeMap[format] || 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="subtitles_${scriptId.slice(0, 8)}_${targetLang}.${format}"`,
    );
    res.send(content);
  }
}
