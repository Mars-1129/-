import { Controller, Get, Post, Body, Query, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { CommentService } from './comment.service';
import { FetchCommentsDto } from './dto/fetch-comments.dto';
import { AnalyzeCommentsDto } from './dto/analyze-comments.dto';
import { OptimizeContentDto } from './dto/optimize-content.dto';

@ApiTags('评论情感分析')
@Controller('api/v1/comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post('fetch')
  @ApiOperation({ summary: '从平台采集评论' })
  async fetchComments(@Body() dto: FetchCommentsDto) {
    const result = await this.commentService.fetchComments(dto);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Get()
  @ApiOperation({ summary: '查询评论列表（含分析结果）' })
  async listComments(
    @Query('product_id') product_id: string,
    @Query('sentiment') sentiment?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.commentService.listComments({
      product_id,
      sentiment: sentiment as 'positive' | 'neutral' | 'negative' | undefined,
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Post('analyze')
  @ApiOperation({ summary: '批量分析评论情感（两阶段：小模型分类+大模型深度分析）' })
  async analyzeComments(@Body() dto: AnalyzeCommentsDto) {
    const result = await this.commentService.analyzeComments(dto);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Post('analyze/stream')
  @ApiOperation({ summary: '批量分析评论情感（SSE 实时进度）' })
  async analyzeCommentsStream(@Body() dto: AnalyzeCommentsDto, @Res() res: Response): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 立即发送连接确认，确保代理层不缓冲后续事件
    send('connected', { message: 'SSE 连接已建立，开始两阶段分析' });

    try {
      const result = await this.commentService.analyzeComments(dto, (progress) => {
        send('progress', progress);
      });
      send('result', result);
      send('done', {});
      res.end();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      send('error', { message: errMsg });
      send('done', {});
      res.end();
    }
  }

  @Get('analysis/:productId')
  @ApiOperation({ summary: '获取产品情感分析摘要' })
  async getAnalysisSummary(@Param('productId') productId: string) {
    const result = await this.commentService.getAnalysisSummary(productId);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Post('optimize')
  @ApiOperation({ summary: '基于评论分析触发内容优化' })
  async triggerOptimization(@Body() dto: OptimizeContentDto) {
    const result = await this.commentService.triggerOptimization(dto);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Post('optimize/stream')
  @ApiOperation({ summary: '基于评论分析触发内容优化（SSE 实时进度）' })
  async triggerOptimizationStream(@Body() dto: OptimizeContentDto, @Res() res: Response): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // 立即发送保活心跳，确保代理层不会缓冲后续事件
    send('connected', { message: 'SSE 连接已建立，开始优化流程' });

    try {
      const result = await this.commentService.triggerOptimization(dto, (progress) => {
        send('progress', progress);
      });
      send('result', result);
      send('done', {});
      res.end();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      send('error', { message: errMsg });
      send('done', {});
      res.end();
    }
  }

  @Get('optimizations')
  @ApiOperation({ summary: '查询优化历史' })
  async listOptimizations(@Query('product_id') product_id: string) {
    const result = await this.commentService.listOptimizations(product_id);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Post('optimizations/:id/apply')
  @ApiOperation({ summary: '手动应用优化建议' })
  async applyOptimization(@Param('id') id: string) {
    const result = await this.commentService.applyOptimization(id);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }

  @Post('optimizations/:id/rollback')
  @ApiOperation({ summary: '回滚优化' })
  async rollbackOptimization(@Param('id') id: string) {
    const result = await this.commentService.rollbackOptimization(id);
    return { success: true, data: result, trace_id: '', timestamp: new Date().toISOString() };
  }
}
