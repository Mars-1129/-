import {
  Controller,
  Get,
  Post,
  Delete,
  Query,
  Param,
  UseInterceptors,
  UploadedFile,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiConsumes,
  ApiOperation,
  ApiTags,
  ApiBody,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiPayloadTooLargeResponse,
  ApiBadGatewayResponse,
  ApiServiceUnavailableResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { MaterialService, MaterialUploadResponse, MaterialListResponse, MaterialDetailResponse, MaterialSearchResponse, MaterialReprocessResponse } from './material.service';
import { UploadMaterialDto } from './dto/upload-material.dto';
import { ListMaterialsDto } from './dto/list-materials.dto';
import { SearchMaterialsDto } from './dto/search-materials.dto';
import { ApiSuccessResponse, ApiErrorResponse } from '@tikstream/shared-types';
import { randomUUID } from 'node:crypto';
import { buildApiErrorResponse } from '../common/http-error-response';

@ApiTags('Material')
@Controller('api/v1/materials')
export class MaterialController {
  constructor(private readonly materialService: MaterialService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: '素材上传与结构化入库',
    description: '接收 multipart/form-data 视频或图片素材，直传 MinIO，Prisma transaction 双表持久化，触发 GPU 异步二级分析任务',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: '素材文件与元数据',
    schema: {
      type: 'object',
      required: ['file', 'product_id', 'type'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '素材文件 (jpeg/png/webp/mp4)',
        },
        product_id: {
          type: 'string',
          description: '商品ID',
          example: '00000000-0000-0000-0000-000000000001',
        },
        type: {
          type: 'string',
          enum: ['IMAGE', 'VIDEO', 'PRODUCT_MAIN_IMAGE'],
          description: '素材类型',
        },
        source_type: {
          type: 'string',
          enum: ['UPLOAD', 'REFERENCE', 'GENERATED'],
          default: 'UPLOAD',
          description: '素材来源类型',
        },
        remark: {
          type: 'string',
          description: '备注信息',
        },
        qdrant_skip: {
          type: 'boolean',
          default: false,
          description: '跳过 Qdrant 向量检索入库',
        },
        reference_material_id: {
          type: 'string',
          description: '参考素材关联的主素材ID（source_type=REFERENCE 时必填）',
        },
        reference_category: {
          type: 'string',
          enum: ['COMPETITOR_IMAGE', 'COMPETITOR_VIDEO', 'INSPIRATION', 'BENCHMARK'],
          description: '参考素材分类（source_type=REFERENCE 时必填）',
        },
      },
    },
  })
  @ApiCreatedResponse({ description: '素材上传成功，返回 material_id 与 async_task_id' })
  @ApiBadRequestResponse({ description: '校验失败：文件格式不支持、文件缺失、类型不一致' })
  @ApiNotFoundResponse({ description: '商品不存在' })
  @ApiPayloadTooLargeResponse({ description: '文件大小超出上限' })
  @ApiBadGatewayResponse({ description: '对象存储写入失败' })
  @ApiInternalServerErrorResponse({ description: '内部服务器错误' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMaterialDto,
  ): Promise<MaterialUploadResponse> {
    return this.materialService.uploadMaterial(dto, file);
  }

  // ========== 分片上传端点 ==========

  @Post('upload/init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '初始化分片上传',
    description: '创建上传任务，返回 upload_id 用于后续分片上传',
  })
  @ApiCreatedResponse({ description: '上传任务创建成功' })
  @ApiBadRequestResponse({ description: '参数校验失败' })
  async initChunkedUpload(
    @Body() body: {
      upload_id: string;
      file_name: string;
      file_size: number;
      chunk_size: number;
      total_chunks: number;
      product_id: string;
      type: 'IMAGE' | 'VIDEO';
      remark?: string;
    },
  ): Promise<{ success: boolean; data: { upload_id: string; chunk_size: number; total_chunks: number } }> {
    const result = await this.materialService.initChunkedUpload(body);
    return { success: true, data: result };
  }

  @Post('upload/chunk')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('chunk'))
  @ApiOperation({
    summary: '上传分片',
    description: '接收单个分片文件，存储到临时目录',
  })
  @ApiConsumes('multipart/form-data')
  @ApiCreatedResponse({ description: '分片上传成功' })
  @ApiBadRequestResponse({ description: '参数校验失败' })
  async uploadChunk(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { upload_id: string; chunk_index: number },
  ): Promise<{ success: boolean; data: { upload_id: string; chunk_index: number } }> {
    await this.materialService.uploadChunk(body.upload_id, body.chunk_index, file.buffer);
    return { success: true, data: { upload_id: body.upload_id, chunk_index: body.chunk_index } };
  }

  @Post('upload/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '完成分片上传',
    description: '合并所有分片，触发素材处理流程',
  })
  @ApiCreatedResponse({ description: '分片合并成功，素材处理开始' })
  @ApiBadRequestResponse({ description: '参数校验失败' })
  @ApiNotFoundResponse({ description: '上传任务不存在' })
  async completeChunkedUpload(
    @Body() body: { upload_id: string },
  ): Promise<{ success: boolean; data: { material_id: string; file_name: string; status: string; thumbnail_url?: string } }> {
    const result = await this.materialService.completeChunkedUpload(body.upload_id);
    return { success: true, data: result };
  }

  @Get('upload/status/:uploadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '查询分片上传状态',
    description: '获取已上传的分片列表，用于断点续传',
  })
  @ApiOkResponse({ description: '查询成功' })
  @ApiNotFoundResponse({ description: '上传任务不存在' })
  async getUploadStatus(
    @Param('uploadId') uploadId: string,
  ): Promise<{ success: boolean; data: { upload_id: string; completed_chunks: number[]; total_chunks: number; status: string } }> {
    const result = await this.materialService.getChunkedUploadStatus(uploadId);
    return { success: true, data: result };
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '素材列表查询（游标分页）',
    description: '支持 cursor 游标分页、多维度筛选 (type/status/source_type)、关键词模糊搜索 (file_name ILIKE)、时间范围过滤 (created_at)、排序 (created_at/file_size_bytes/duration_seconds ASC/DESC)，返回统一响应包装 { items: MaterialListItem[], page_info: { cursor, has_more, total_count } }',
  })
  @ApiQuery({ name: 'product_id', required: true, type: String, description: '商品ID（必填，上下文隔离边界）', example: '00000000-0000-0000-0000-000000000001' })
  @ApiQuery({ name: 'type', required: false, enum: ['IMAGE', 'VIDEO', 'PRODUCT_MAIN_IMAGE'], description: '素材类型筛选' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'], description: '素材状态筛选' })
  @ApiQuery({ name: 'source_type', required: false, enum: ['UPLOAD', 'REFERENCE', 'GENERATED'], description: '素材来源类型筛选' })
  @ApiQuery({ name: 'keyword', required: false, type: String, description: '文件名关键词模糊搜索 (ILIKE)', example: '卷发棒' })
  @ApiQuery({ name: 'created_at_start', required: false, type: String, description: '创建时间起始 (ISO8601)', example: '2026-05-20T00:00:00Z' })
  @ApiQuery({ name: 'created_at_end', required: false, type: String, description: '创建时间截止 (ISO8601)', example: '2026-05-27T00:00:00Z' })
  @ApiQuery({ name: 'sort_by', required: false, enum: ['created_at', 'file_size_bytes', 'duration_seconds'], description: '排序字段', example: 'created_at' })
  @ApiQuery({ name: 'sort_order', required: false, enum: ['ASC', 'DESC'], description: '排序方向', example: 'DESC' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: '每页条数 (1~100)', example: 20 })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: '游标分页 token (base64url)，首次查询不传' })
  @ApiOkResponse({ description: '查询成功，返回素材列表与分页信息' })
  @ApiBadRequestResponse({ description: '参数校验失败：非法排序字段、时间格式错误、limit 越界' })
  @ApiInternalServerErrorResponse({ description: '数据库查询失败 (P1001/P2024/P2028)' })
  async list(
    @Query() dto: ListMaterialsDto,
  ): Promise<MaterialListResponse> {
    return this.materialService.listMaterials(dto);
  }


  @Get('trash')
  @ApiOperation({
    summary: '回收站素材列表',
    description: '获取指定商品的已删除素材列表（软删除）',
  })
  @ApiQuery({ name: 'product_id', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOkResponse({ description: '回收站素材列表' })
  async listTrash(
    @Query('product_id') productId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ): Promise<MaterialListResponse> {
    return this.materialService.listTrashMaterials({
      product_id: productId,
      limit: limit ? parseInt(limit, 10) : 20,
      cursor,
    });
  }

  @Get(':material_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '素材详情查询',
    description: '根据 material_id 查询单条素材完整信息，包含关联商品 (product) 与全部切片列表 (slices)，切片按 start_time 升序排列',
  })
  @ApiParam({
    name: 'material_id',
    required: true,
    type: String,
    description: '素材 UUID v4',
    example: 'dc52d4ff-0000-4000-a000-000000000010',
  })
  @ApiOkResponse({ description: '查询成功，返回素材完整信息与切片列表' })
  @ApiBadRequestResponse({ description: 'material_id 缺失或格式非法 (非 UUID v4)' })
  @ApiNotFoundResponse({ description: '素材不存在 (MATERIAL_NOT_FOUND)' })
  @ApiInternalServerErrorResponse({ description: '数据库查询失败 (P1001/P2024/P2028)' })
  async getDetail(
    @Param('material_id') materialId: string,
  ): Promise<MaterialDetailResponse> {
    return this.materialService.getMaterialDetail(materialId);
  }

  // ========== 回收站功能 ==========

  @Delete('trash')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '清空回收站',
    description: '永久删除指定商品下回收站中的所有素材及其切片',
  })
  @ApiQuery({
    name: 'product_id',
    required: true,
    type: String,
    description: '商品 UUID v4',
  })
  @ApiOkResponse({ description: '清空成功' })
  @ApiBadRequestResponse({ description: 'product_id 缺失' })
  @ApiInternalServerErrorResponse({ description: '清空失败' })
  async clearTrash(
    @Query('product_id') productId: string,
  ): Promise<{ success: boolean; deleted_count: number }> {
    return { success: true, ...(await this.materialService.deleteMaterialsByProduct(productId)) };
  }

  @Delete(':material_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '素材软删除（移入回收站）',
    description: '根据 material_id 软删除素材，设置 deletedAt 标记并清理 Qdrant 向量数据。素材和切片记录保留在数据库中，可通过恢复接口还原。MinIO 对象不在此步骤清理。',
  })
  @ApiParam({
    name: 'material_id',
    required: true,
    type: String,
    description: '素材 UUID v4',
    example: 'dc52d4ff-0000-4000-a000-000000000010',
  })
  @ApiOkResponse({ description: '删除成功' })
  @ApiBadRequestResponse({ description: 'material_id 缺失或格式非法 (非 UUID v4)' })
  @ApiNotFoundResponse({ description: '素材不存在 (MATERIAL_NOT_FOUND)' })
  @ApiConflictResponse({ description: '存在外键约束，无法删除 (MATERIAL_DELETE_CONFLICT)' })
  @ApiInternalServerErrorResponse({ description: '数据库事务失败 (P1001/P2024/P2028)' })
  async deleteMaterial(
    @Param('material_id') materialId: string,
  ): Promise<{ success: boolean }> {
    return this.materialService.deleteMaterial(materialId);
  }

  // ========== 回收站功能 ==========

  @Post(':material_id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '恢复素材',
    description: '从回收站恢复已删除的素材',
  })
  @ApiParam({ name: 'material_id', required: true, type: String })
  @ApiOkResponse({ description: '恢复成功' })
  @ApiNotFoundResponse({ description: '素材不存在或未在回收站中' })
  async restoreMaterial(
    @Param('material_id') materialId: string,
  ): Promise<{ success: boolean }> {
    return this.materialService.restoreMaterial(materialId);
  }

  @Delete(':material_id/permanent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '永久删除素材',
    description: '从回收站永久删除素材（包括切片和存储文件）',
  })
  @ApiParam({ name: 'material_id', required: true, type: String })
  @ApiOkResponse({ description: '永久删除成功' })
  @ApiNotFoundResponse({ description: '素材不存在' })
  @ApiConflictResponse({ description: '存在外键约束，无法删除' })
  async permanentDeleteMaterial(
    @Param('material_id') materialId: string,
  ): Promise<{ success: boolean }> {
    return this.materialService.permanentDeleteMaterial(materialId);
  }

  @Post('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '素材多维检索（向量语义 + 结构化过滤 + 关键字兜底）',
    description: '支持 Qdrant 向量语义检索 (ImageBind 512维) + 结构化过滤 (type/status/duration range) + PostgreSQL 关键字 ILIKE 兜底检索。search_mode=AUTO 时自动选择最优路径，Qdrant 不可用/无结果时静默降级到关键字检索。返回 MaterialSlice 列表含相似度分数 (score)。',
  })
  @ApiBody({
    description: '检索请求体',
    type: SearchMaterialsDto,
    examples: {
      basic: {
        summary: '基础语义检索',
        value: {
          product_id: '00000000-0000-0000-0000-000000000001',
          query: 'wireless hair curler close-up shot',
        },
      },
      withFilters: {
        summary: '含结构化筛选',
        value: {
          product_id: '00000000-0000-0000-0000-000000000001',
          query: 'wireless hair curler',
          type: 'VIDEO',
          status: 'COMPLETED',
          min_duration: 1.5,
          max_duration: 4.0,
          search_mode: 'AUTO',
          limit: 20,
        },
      },
    },
  })
  @ApiOkResponse({ description: '检索成功，返回切片列表。search_source=vector 表示向量检索结果，search_source=keyword_fallback 表示关键字兜底' })
  @ApiBadRequestResponse({ description: '参数校验失败：limit 越界、无查询条件' })
  @ApiServiceUnavailableResponse({ description: 'search_mode=VECTOR 强制模式时 Qdrant 不可用 (VECTOR_SEARCH_FAILED)' })
  @ApiInternalServerErrorResponse({ description: '数据库查询失败 (P1001/P2024/P2028)' })
  async search(
    @Body() dto: SearchMaterialsDto,
  ): Promise<MaterialSearchResponse> {
    return this.materialService.searchMaterialSlices(dto);
  }

  @Post(':material_id/reprocess')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '素材重新处理（重置切片 + 重新入队 GPU Worker）',
    description: '根据 material_id 重新触发素材切片与语义打标。仅 COMPLETED/FAILED 状态的素材允许重新处理。先清除旧切片并重置 status=PENDING+slices_count=0，然后异步入队 gpu-slicing-worker 重新执行 Decord+TransNetV2 + Doubao Dense Caption。返回 task_id 用于追踪异步任务。',
  })
  @ApiParam({
    name: 'material_id',
    required: true,
    type: String,
    description: '素材 UUID v4',
    example: 'dc52d4ff-0000-4000-a000-000000000010',
  })
  @ApiOkResponse({ description: '重新处理任务已入队，返回 material_id、task_id、status=PENDING' })
  @ApiBadRequestResponse({ description: 'material_id 缺失或格式非法 (非 UUID v4)' })
  @ApiNotFoundResponse({ description: '素材不存在 (MATERIAL_NOT_FOUND)' })
  @ApiConflictResponse({ description: '素材当前状态不允许重新处理，仅 COMPLETED/FAILED 可重新处理 (TASK_STATUS_CONFLICT)' })
  @ApiInternalServerErrorResponse({ description: '数据库事务失败 (P1001/P2024/P2028)' })
  async reprocess(
    @Param('material_id') materialId: string,
  ): Promise<MaterialReprocessResponse> {
    return this.materialService.reprocessMaterial(materialId);
  }

  @Post(':material_id/check-copyright')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '版权检测',
    description: '基于素材元数据的多因子启发式版权检测（不依赖外部版权服务）',
  })
  @ApiParam({
    name: 'material_id',
    required: true,
    type: String,
    description: '素材 UUID v4',
  })
  @ApiOkResponse({ description: '版权检测结果 — CLEAN / SUSPICIOUS / FLAGGED' })
  @ApiBadRequestResponse({ description: 'material_id 缺失或格式非法' })
  async checkCopyright(
    @Param('material_id') materialId: string,
  ): Promise<ApiSuccessResponse<{ material_id: string; copyright_status: string; message: string; confidence: number }> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.materialService.checkMaterialCopyright(materialId);
      return {
        success: true,
        message: '版权检测完成',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post(':material_id/vision-analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI 视觉理解分析',
    description: '使用硅基流动 Qwen3-VL-32B 多模态模型对素材主图进行深度视觉分析，提取商品特征、视觉卖点、推荐分镜类型和风格标签',
  })
  @ApiParam({
    name: 'material_id',
    required: true,
    type: String,
    description: '素材 UUID v4',
  })
  @ApiOkResponse({ description: '视觉分析完成' })
  @ApiNotFoundResponse({ description: '素材不存在' })
  async visionAnalyze(
    @Param('material_id') materialId: string,
  ): Promise<ApiSuccessResponse | ApiErrorResponse> {
    const traceId = randomUUID();
    try {
      const data = await this.materialService.analyzeMaterialVision(materialId);
      return {
        success: true,
        message: '视觉分析完成',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }
}
