import type { CreateProductRequest, UpdateProductRequest, PaginatedData, Product, ProductListQuery, ProductStatsResponse } from '@tikstream/shared-types';
import { request } from './http';

export function listProducts(query: ProductListQuery = {}): Promise<PaginatedData<Product>> {
  return request<PaginatedData<Product>>('/api/v1/products', {
    query: {
      page: query.page ?? 1,
      page_size: query.page_size ?? 50,
      category: query.category,
      keyword: query.keyword,
    },
  });
}

export function getProduct(productId: string): Promise<Product> {
  return request<Product>(`/api/v1/products/${productId}`);
}

export function createProduct(data: CreateProductRequest): Promise<Product> {
  return request<Product>('/api/v1/products', { method: 'POST', body: data });
}

export function updateProduct(productId: string, data: UpdateProductRequest): Promise<Product> {
  return request<Product>(`/api/v1/products/${productId}`, { method: 'PATCH', body: data });
}

export function deleteProduct(productId: string): Promise<void> {
  return request<void>(`/api/v1/products/${productId}`, { method: 'DELETE' });
}

export function getProductStats(): Promise<ProductStatsResponse> {
  return request<ProductStatsResponse>('/api/v1/products/stats');
}
