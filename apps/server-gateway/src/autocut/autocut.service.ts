import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import { QUEUE_CONSTANTS } from '../../services/queue/queue.constants';

@Injectable()
export class AutocutService {
  private readonly logger = new Logger(AutocutService.name);

  constructor(
    @Inject('AUTOCUT_QUEUE') private readonly autocutQueue: Queue,
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  // 使用 any 类型访问 autocutJob 表 (Prisma 尚未生成类型，迁移后生效)
  private get autocut() {
    return (this.prisma as any).autocutJob;
  }

  /**
   * 提交视频进行转录
   */
  async submitTranscribe(dto: { material_id: string }) {
    const material = await this.prisma.material.findUnique({
      where: { id: dto.material_id },
      select: { id: true, fileName: true, durationSeconds: true },
    });

    if (!material) {
      return { success: false, message: 'Material not found' };
    }

    // 创建 AutocutJob
    const job = await this.autocut.create({
      data: {
        materialId: material.id,
        materialName: material.fileName,
        status: 'TRANSCRIBING',
        videoDuration: material.durationSeconds ? Number(material.durationSeconds) : null,
      },
    });

    // 入队
    await this.autocutQueue.add(
      QUEUE_CONSTANTS.AUTOCUT_JOB_NAME_TRANSCRIBE,
      {
        jobType: 'TRANSCRIBE',
        jobId: job.id,
        materialId: material.id,
        submittedAt: new Date().toISOString(),
      },
    );

    this.logger.log(`Autocut transcribe submitted: job=${job.id}, material=${material.id}`);

    return {
      success: true,
      data: { job_id: job.id, status: 'TRANSCRIBING' },
    };
  }

  /**
   * 列出 Autocut 任务
   */
  async listJobs(params: { status?: string; limit: number }) {
    const where: Record<string, unknown> = {};
    if (params.status) where.status = params.status;

    const jobs = await this.autocut.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: params.limit,
      select: {
        id: true,
        materialId: true,
        materialName: true,
        status: true,
        progress: true,
        outputUrl: true,
        createdAt: true,
      },
    });

    return { success: true, data: { jobs } };
  }

  /**
   * 获取转录结果 (字幕段列表)
   */
  async getTranscript(jobId: string) {
    const job = await this.autocut.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, message: 'Job not found' };

    return {
      success: true,
      data: {
        job_id: job.id,
        status: job.status,
        segments: job.segments || [],
        srt_content: job.srtContent,
        language: job.language,
        video_duration: job.videoDuration,
      },
    };
  }

  /**
   * 更新段选中状态
   */
  async updateSegments(jobId: string, dto: { segments: Array<{ index: number; selected: boolean }> }) {
    const job = await this.autocut.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, message: 'Job not found' };
    if (job.status !== 'READY_FOR_EDIT') {
      return { success: false, message: `Job not ready (status=${job.status})` };
    }

    const currentSegments = Array.isArray(job.segments) ? job.segments : [];
    const updateMap = new Map<number, boolean>();
    for (const s of dto.segments) updateMap.set(s.index, s.selected);

    const updated = currentSegments.map((seg: Record<string, unknown>) => {
      if (updateMap.has(seg.index as number)) {
        return { ...seg, selected: updateMap.get(seg.index as number) };
      }
      return seg;
    });

    await this.autocut.update({
      where: { id: jobId },
      data: { segments: updated },
    });

    const selectedCount = updated.filter((s: Record<string, unknown>) => s.selected).length;
    return { success: true, data: { updated: true, selected_count: selectedCount, total_count: updated.length } };
  }

  /**
   * 执行剪切导出
   */
  async executeCut(jobId: string) {
    const job = await this.autocut.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, message: 'Job not found' };
    if (job.status !== 'READY_FOR_EDIT') {
      return { success: false, message: `Job not ready (status=${job.status})` };
    }

    await this.autocut.update({
      where: { id: jobId },
      data: { status: 'CUTTING', progress: 0 },
    });

    await this.autocutQueue.add(
      QUEUE_CONSTANTS.AUTOCUT_JOB_NAME_CUT,
      {
        jobType: 'CUT',
        jobId: job.id,
        materialId: job.materialId,
        submittedAt: new Date().toISOString(),
      },
    );

    this.logger.log(`Autocut cut submitted: job=${job.id}`);
    return { success: true, data: { job_id: job.id, status: 'CUTTING' } };
  }

  /**
   * 查询任务状态
   */
  async getStatus(jobId: string) {
    const job = await this.autocut.findUnique({
      where: { id: jobId },
      select: {
        id: true, status: true, stage: true, progress: true,
        outputUrl: true, error: true,
      },
    });
    if (!job) return { success: false, message: 'Job not found' };
    return { success: true, data: job };
  }

  // ================================================================
  // Internal callbacks (Worker → Gateway)
  // ================================================================

  async handleTranscriptReady(body: {
    job_id: string;
    segments: Array<Record<string, unknown>>;
    srt_content: string;
    language: string;
    video_duration: number;
  }) {
    await this.autocut.update({
      where: { id: body.job_id },
      data: {
        status: 'READY_FOR_EDIT',
        segments: body.segments,
        srtContent: body.srt_content,
        language: body.language,
        progress: 100,
      },
    });
    this.logger.log(`Autocut transcript ready: job=${body.job_id}, count=${body.segments.length}`);
    return { success: true };
  }

  async handleCutComplete(body: { job_id: string; output_url: string }) {
    await this.autocut.update({
      where: { id: body.job_id },
      data: { status: 'COMPLETED', outputUrl: body.output_url, progress: 100 },
    });
    this.logger.log(`Autocut cut complete: job=${body.job_id}`);
    return { success: true };
  }

  async handleJobFailed(body: { job_id: string; error: string }) {
    await this.autocut.update({
      where: { id: body.job_id },
      data: { status: 'FAILED', error: body.error },
    });
    this.logger.error(`Autocut job failed: job=${body.job_id}, error=${body.error}`);
    return { success: true };
  }

  async getJobInternal(jobId: string) {
    const job = await this.autocut.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, data: null };
    return {
      success: true,
      data: {
        id: job.id,
        materialId: job.materialId,
        segments: job.segments,
        status: job.status,
      },
    };
  }
}
