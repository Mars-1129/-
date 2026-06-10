import {
  Controller,
  Get,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import {
  MaterialJobFailureCallbackRequest,
  MaterialService,
  SliceCallbackRequest,
} from './material.service';
import { MaterialRepository } from './material.repository';

@Controller({ path: 'api/internal/v1/materials', version: '1' })
export class InternalMaterialController {
  constructor(
    private readonly materialService: MaterialService,
    private readonly materialRepository: MaterialRepository,
  ) {}

  @Get(':materialId')
  @HttpCode(HttpStatus.OK)
  async getMaterial(@Param('materialId') materialId: string) {
    const material = await this.materialRepository.findMaterialById(materialId);

    if (!material) {
      return {
        success: false,
        error: `Material not found: ${materialId}`,
      };
    }

    const materialData = material as Record<string, unknown>;

    return {
      success: true,
      data: {
        material_id: materialData.id,
        product_id: materialData.productId,
        file_name: materialData.fileName,
        duration_seconds: materialData.durationSeconds,
        origin_url: materialData.originUrl,
        type: materialData.type,
        slices: Array.isArray(materialData.slices)
          ? (materialData.slices as Array<Record<string, unknown>>).map((s) => ({
              id: s.id,
              slice_id: s.sliceId,
              start_time: s.startTime,
              end_time: s.endTime,
              duration: s.duration,
              status: s.status,
            }))
          : [],
        product: materialData.product
          ? {
              id: (materialData.product as Record<string, unknown>).id,
              title: (materialData.product as Record<string, unknown>).title,
              category: (materialData.product as Record<string, unknown>).category,
              selling_points: (materialData.product as Record<string, unknown>).sellingPoints,
            }
          : null,
      },
    };
  }

  @Post('slice-callback')
  @HttpCode(HttpStatus.OK)
  async sliceCallback(
    @Body() callback: SliceCallbackRequest,
  ): Promise<{ success: boolean; message: string; trace_id: string }> {
    await this.materialService.handleSliceCallback(callback);
    return {
      success: true,
      message: 'Slice status updated',
      trace_id: callback.trace_id,
    };
  }

  @Post('batch-callback')
  @HttpCode(HttpStatus.OK)
  async batchCallback(
    @Body() body: { material_id: string; trace_id: string },
  ): Promise<{ success: boolean; message: string }> {
    await this.materialService.handleBatchCallback(body.material_id);
    return {
      success: true,
      message: 'Batch sync completed',
    };
  }

  @Post('reindex-embeddings')
  @HttpCode(HttpStatus.OK)
  async reindexEmbeddings(
    @Body() body: { limit?: number; cursor?: string },
  ): Promise<{ success: boolean; data: Awaited<ReturnType<MaterialService['reindexEmbeddings']>> }> {
    const data = await this.materialService.reindexEmbeddings(body);
    return { success: true, data };
  }

  @Post('job-failure')
  @HttpCode(HttpStatus.OK)
  async jobFailure(
    @Body() callback: MaterialJobFailureCallbackRequest,
  ): Promise<{ success: boolean; message: string; trace_id: string }> {
    await this.materialService.handleJobFailureCallback(callback);
    return {
      success: true,
      message: 'Material job failure recorded',
      trace_id: callback.trace_id,
    };
  }
}
