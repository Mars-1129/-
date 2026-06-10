// =============================================================================
// TikStream AI — Watermark Service
// =============================================================================

import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectPrisma } from '@nestjs/prisma';
import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WATERMARK_CONSTANTS } from './watermark.constants';
import { serviceException } from '../common/service-exception';
import {
  ErrorCode,
  WatermarkConfig,
  WatermarkApplyResponse,
  WatermarkApplyRequest,
  WatermarkVerifyResult,
} from '@tikstream/shared-types';

const execFileAsync = promisify(execFile);
const ffprobePath = process.env.FFPROBE_BINARY || 'ffprobe';

interface WatermarkVerifyOutput {
  has_visible: boolean;
  has_metadata: boolean;
  metadata: Record<string, string>;
}

@Injectable()
export class WatermarkService {
  private readonly logger = new Logger(WatermarkService.name);

  constructor(
    @InjectPrisma() private readonly prisma: PrismaClient,
  ) {}

  // =========================================================================
  // Public: Apply Watermark
  // =========================================================================

  async applyWatermark(
    creationId: string,
    config: WatermarkConfig,
    forceRender = false,
  ): Promise<WatermarkApplyResponse> {
    try {
      // Validate creation exists and is in a valid state
      const creation = await this.prisma.creation.findUnique({
        where: { id: creationId },
        select: {
          id: true,
          status: true,
          videoUrl: true,
          productId: true,
          scriptId: true,
          taskId: true,
          targetResolution: true,
          exportFormat: true,
        },
      });

      if (!creation) {
        throw serviceException(
          {
            message: WATERMARK_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND,
            error: { code: ErrorCode.CREATION_NOT_FOUND, retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Update watermark config in DB
      await this.prisma.creation.update({
        where: { id: creationId },
        data: { watermarkConfig: config as unknown as Prisma.InputJsonValue } as any,
      });

      const canRerender =
        creation.status === 'FINISHED' &&
        creation.videoUrl &&
        (forceRender || config.enabled);

      // Note: Actual re-render with watermark is triggered by the
      // creation.exporter — it reads watermarkConfig from DB and
      // passes it to the Worker via the BullMQ job payload.
      if (canRerender) {
        this.logger.log(
          `Watermark config saved for creation=${creationId}; ` +
          `re-render will include watermark on next export/restitch`,
        );
      }

      return {
        creation_id: creationId,
        watermark_applied: !!canRerender,
        config,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error(
        `Watermark apply failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw serviceException(
        {
          message: WATERMARK_CONSTANTS.ERROR_MESSAGES.WATERMARK_APPLY_FAILED,
          error: {
            code: ErrorCode.WATERMARK_APPLY_FAILED,
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================================
  // Public: Remove Watermark
  // =========================================================================

  async removeWatermark(creationId: string): Promise<{ success: boolean }> {
    try {
      const creation = await this.prisma.creation.findUnique({
        where: { id: creationId },
        select: { id: true, status: true, videoUrl: true, productId: true, scriptId: true, taskId: true, targetResolution: true, exportFormat: true },
      });

      if (!creation) {
        throw serviceException(
          {
            message: WATERMARK_CONSTANTS.ERROR_MESSAGES.CREATION_NOT_FOUND,
            error: { code: ErrorCode.CREATION_NOT_FOUND, retryable: false },
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Clear watermark config
      await this.prisma.creation.update({
        where: { id: creationId },
        data: { watermarkConfig: null as unknown as Prisma.InputJsonValue } as any,
      });

      this.logger.log(`Watermark config cleared for creation=${creationId}`);

      return { success: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;

      this.logger.error(
        `Watermark remove failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw serviceException(
        {
          message: WATERMARK_CONSTANTS.ERROR_MESSAGES.WATERMARK_APPLY_FAILED,
          error: {
            code: ErrorCode.WATERMARK_APPLY_FAILED,
            retryable: true,
          },
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // =========================================================================
  // Public: Verify Watermark
  // =========================================================================

  async verifyWatermark(videoUrl: string): Promise<WatermarkVerifyResult> {
    try {
      const result = await this.ffprobeWatermark(videoUrl);
      return {
        has_visible_watermark: result.has_visible,
        has_invisible_watermark: result.has_metadata,
        copyright_metadata: result.has_metadata
          ? {
              holder: result.metadata.copyright || undefined,
              license_type: result.metadata.license || undefined,
              copyright_year: result.metadata.copyright_year || undefined,
            }
          : undefined,
        video_container: 'mp4',
        checked_at: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Watermark verify failed: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw serviceException(
        {
          message: WATERMARK_CONSTANTS.ERROR_MESSAGES.WATERMARK_VERIFY_FAILED,
          error: {
            code: ErrorCode.WATERMARK_VERIFY_FAILED,
            retryable: false,
          },
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // =========================================================================
  // Private: FFprobe Metadata Extraction
  // =========================================================================

  private async ffprobeWatermark(videoUrl: string): Promise<WatermarkVerifyOutput> {
    const args = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_entries', 'format_tags',
      videoUrl,
    ];

    const { stdout } = await execFileAsync(ffprobePath, args, { timeout: 15000 });
    const probe = JSON.parse(stdout);
    const tags = probe?.format?.tags || {};

    const hasMetadata =
      'watermark_payload' in tags ||
      'watermark_technique' in tags ||
      'copyright' in tags;

    return {
      has_visible: false, // Visible watermark requires OCR/visual analysis → Phase 2
      has_metadata: hasMetadata,
      metadata: tags,
    };
  }
}
