import { Controller, Get, Param, Query, Post, Body, Patch, Delete, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags, ApiBody } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import {
  ApiErrorResponse,
  ApiSuccessResponse,
  PaginatedData,
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  ProductStatsResponse,
} from '@tikstream/shared-types';
import { buildApiErrorResponse } from '../common/http-error-response';
import { ProductService } from './product.service';

@ApiTags('Product')
@Controller('api/v1/products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({
    summary: '查询商品列表',
    description: '分页查询商品列表，支持按 category 和 keyword 过滤',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'page_size', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  @ApiResponse({ status: 200, description: '查询成功' })
  async listProducts(
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
  ): Promise<ApiSuccessResponse<PaginatedData<Product>> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.productService.listProducts({
        page: page ? Number(page) : undefined,
        page_size: pageSize ? Number(pageSize) : undefined,
        category,
        keyword,
      });

      return {
        success: true,
        message: '查询成功',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get(':product_id')
  @ApiOperation({
    summary: '获取商品详情',
    description: '根据 product_id 获取单个商品详情',
  })
  @ApiParam({ name: 'product_id', required: true, description: '商品ID' })
  @ApiResponse({ status: 200, description: '查询成功' })
  @ApiResponse({ status: 404, description: '商品不存在' })
  async getProductDetail(
    @Param('product_id') productId: string,
  ): Promise<ApiSuccessResponse<Product> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.productService.getProductDetail(productId);

      return {
        success: true,
        message: '查询成功',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '创建商品',
    description: '创建一个新的商品记录（用于自动识别后的商品创建）',
  })
  @ApiBody({ type: Object, description: 'CreateProductRequest' })
  @ApiResponse({ status: 201, description: '创建成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  async createProduct(
    @Body() dto: CreateProductRequest,
  ): Promise<ApiSuccessResponse<Product> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.productService.createProduct(dto);

      return {
        success: true,
        message: '创建成功',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Patch(':product_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '更新商品信息',
    description: '部分更新商品信息，仅更新传入的非 undefined 字段',
  })
  @ApiParam({ name: 'product_id', required: true, description: '商品ID' })
  @ApiBody({ type: Object, description: 'UpdateProductRequest（所有字段可选）' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 400, description: '参数错误' })
  @ApiResponse({ status: 404, description: '商品不存在' })
  async updateProduct(
    @Param('product_id') productId: string,
    @Body() dto: UpdateProductRequest,
  ): Promise<ApiSuccessResponse<Product> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.productService.updateProduct(productId, dto);

      return {
        success: true,
        message: '更新成功',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Delete(':product_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '删除商品',
    description: '删除指定商品。若商品被素材/创作/剧本/模板等引用，将返回 409 冲突错误',
  })
  @ApiParam({ name: 'product_id', required: true, description: '商品ID' })
  @ApiResponse({ status: 200, description: '删除成功，返回被删除的商品信息' })
  @ApiResponse({ status: 404, description: '商品不存在' })
  @ApiResponse({ status: 409, description: '商品被依赖，无法删除' })
  async deleteProduct(
    @Param('product_id') productId: string,
  ): Promise<ApiSuccessResponse<Product> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.productService.deleteProduct(productId);

      return {
        success: true,
        message: '删除成功',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }

  @Get('stats')
  @ApiOperation({
    summary: '获取所有商品素材统计',
    description: '返回每个商品的素材数量、图片数、视频数、切片总数等统计数据',
  })
  @ApiResponse({ status: 200, description: '查询成功' })
  async getStats(): Promise<ApiSuccessResponse<ProductStatsResponse> | ApiErrorResponse> {
    const traceId = randomUUID();

    try {
      const data = await this.productService.getProductStats();

      return {
        success: true,
        message: '查询成功',
        data,
        trace_id: traceId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return buildApiErrorResponse(error, traceId);
    }
  }
}
