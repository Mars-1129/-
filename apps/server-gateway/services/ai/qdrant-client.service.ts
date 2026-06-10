import { Injectable, Logger } from '@nestjs/common';

export interface QdrantSearchParams {
  collectionName: string;
  vector: number[];
  filter?: Record<string, unknown>;
  limit: number;
}

export interface QdrantSearchResult {
  id: string;
  score: number;
  version: number;
  payload?: Record<string, unknown>;
}

export interface QdrantUpsertPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

@Injectable()
export class QdrantClientService {
  private readonly logger = new Logger(QdrantClientService.name);
  private readonly qdrantUrl: string;
  private readonly collectionName: string;
  private readonly materialCollectionName: string;
  private readonly vectorSize: number;

  // HNSW 索引参数调优 (Phase 3)
  private readonly hnswM: number;
  private readonly hnswEfConstruct: number;

  constructor() {
    this.qdrantUrl = process.env.QDRANT_URL || 'http://qdrant:6333';
    this.collectionName = process.env.QDRANT_COLLECTION_ASSETS || 'asset_slices';
    this.materialCollectionName = process.env.QDRANT_COLLECTION_MATERIALS || 'asset_materials';
    this.vectorSize = Number(process.env.EMBEDDING_DIM || '384');
    this.hnswM = Number(process.env.QDRANT_HNSW_M || '24');
    this.hnswEfConstruct = Number(process.env.QDRANT_HNSW_EF_CONSTRUCT || '200');
    this.logger.log(
      `Qdrant client initialized: url=${this.qdrantUrl}, collections=[${this.collectionName}, ${this.materialCollectionName}], dim=${this.vectorSize}, hnsw=[m=${this.hnswM}, ef=${this.hnswEfConstruct}]`,
    );
  }

  getCollectionName(): string {
    return this.collectionName;
  }

  getMaterialCollectionName(): string {
    return this.materialCollectionName;
  }

  getVectorSize(): number {
    return this.vectorSize;
  }

  private collectionUrl(collectionName?: string): string {
    const name = collectionName || this.collectionName;
    return `${this.qdrantUrl.replace(/\/$/, '')}/collections/${name}`;
  }

  private async fetchJson<T>(url: string, init: RequestInit, timeoutMs = 10000): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });

      // 先处理 204 No Content（响应体为空，不可调用 .json()）
      if (response.status === 204) {
        return {} as T;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown');
        throw new Error(`Qdrant HTTP ${response.status}: ${errorText}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getCollectionVectorSize(collectionName: string): Promise<number | null> {
    try {
      const data = await this.fetchJson<{
        result?: { config?: { params?: { vectors?: { size?: number } } } };
      }>(this.collectionUrl(collectionName), { method: 'GET' });
      return data.result?.config?.params?.vectors?.size ?? null;
    } catch {
      return null;
    }
  }

  private async recreateCollection(collectionName: string): Promise<void> {
    const baseUrl = this.collectionUrl(collectionName);

    try {
      await this.fetchJson(`${baseUrl}`, { method: 'DELETE' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Qdrant delete collection before recreate failed (may not exist): ${message}`);
    }

    try {
      await this.fetchJson(baseUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
          hnsw_config: {
            m: this.hnswM,
            ef_construct: this.hnswEfConstruct,
          },
          optimizers_config: {
            indexing_threshold: 20000,
          },
        }),
      });
    } catch (putError) {
      const msg = putError instanceof Error ? putError.message : String(putError);
      throw new Error(`Qdrant recreate collection "${collectionName}" failed: ${msg}`);
    }

    // 创建后添加 payload 索引 (非阻塞)
    await this.ensurePayloadIndexes(collectionName);
    this.logger.warn(`Qdrant collection recreated: ${collectionName} (dim=${this.vectorSize})`);
  }

  async ensureCollection(collectionName?: string): Promise<void> {
    const name = collectionName || this.collectionName;
    const existingSize = await this.getCollectionVectorSize(name);

    if (existingSize != null) {
      if (existingSize !== this.vectorSize) {
        this.logger.warn(
          `Qdrant collection ${name} dim mismatch: existing=${existingSize}, expected=${this.vectorSize}; recreating`,
        );
        await this.recreateCollection(name);
      } else {
        this.logger.log(`Qdrant collection already exists: ${name} (dim=${existingSize})`);
        // 存量 collection 也尝试补充 payload 索引
        await this.ensurePayloadIndexes(name);
      }
      return;
    }

    try {
      await this.fetchJson(this.collectionUrl(name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
          },
          hnsw_config: {
            m: this.hnswM,
            ef_construct: this.hnswEfConstruct,
          },
          optimizers_config: {
            indexing_threshold: 20000,
          },
        }),
      });

      await this.ensurePayloadIndexes(name);
      this.logger.log(`Qdrant collection created: ${name} (dim=${this.vectorSize})`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to create Qdrant collection '${name}': ${msg}`);
      throw error;
    }
  }

  /**
   * Phase 3: 为 collection 创建 payload 索引，加速过滤查询
   * 幂等操作：重复创建不报错
   */
  private async ensurePayloadIndexes(collectionName: string): Promise<void> {
    const payloadFields = [
      { field_name: 'product_id', field_schema: 'keyword' },
      { field_name: 'status', field_schema: 'keyword' },
      { field_name: 'type', field_schema: 'keyword' },
      { field_name: 'material_id', field_schema: 'keyword' },
      { field_name: 'has_vision_analysis', field_schema: 'bool' },
    ];

    for (const { field_name, field_schema } of payloadFields) {
      try {
        await this.fetchJson(
          `${this.collectionUrl(collectionName)}/index`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field_name, field_schema }),
          },
        );
      } catch (err) {
        // 索引已存在 (http 409) 或旧版 Qdrant 不支持 (http 400) 非致命
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('409') || msg.includes('already exists')) {
          this.logger.debug(`Qdrant payload index already exists: ${collectionName}.${field_name}`);
        } else {
          this.logger.warn(`Qdrant payload index creation skipped (${field_name}): ${msg}`);
        }
      }
    }

    this.logger.log(`Qdrant payload indexes ensured for collection: ${collectionName}`);
  }

  async upsertPoint(point: QdrantUpsertPoint, collectionName?: string): Promise<void> {
    const name = collectionName || this.collectionName;
    const url = `${this.collectionUrl(name)}/points?wait=true`;

    await this.fetchJson(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [
          {
            id: point.id,
            vector: point.vector,
            payload: point.payload,
          },
        ],
      }),
    });

    this.logger.log(`Qdrant upsert: collection=${name}, id=${point.id}`);
  }

  async deletePoint(id: string, collectionName?: string): Promise<void> {
    const name = collectionName || this.collectionName;
    const url = `${this.collectionUrl(name)}/points/delete?wait=true`;

    await this.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [id] }),
    });

    this.logger.log(`Qdrant delete point: collection=${name}, id=${id}`);
  }

  async deleteByFilter(filter: Record<string, unknown>, collectionName?: string): Promise<void> {
    const name = collectionName || this.collectionName;
    const url = `${this.collectionUrl(name)}/points/delete?wait=true`;

    // Qdrant API: POST /collections/{name}/points/delete 期望 body 顶层含 filter 字段
    await this.fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    });

    this.logger.log(`Qdrant delete by filter: collection=${name}`);
  }

  /**
   * 批量获取 points (需求1: material embedding 构建时需要读取 slice vectors)
   */
  async getPoints(ids: string[], collectionName?: string): Promise<Array<{ id: string; vector: number[] | null }>> {
    if (ids.length === 0) return [];

    const name = collectionName || this.collectionName;
    const url = this.collectionUrl(name);

    const response = await this.fetchJson<{
      result: Array<{
        id: string | number;
        vector?: number[] | Record<string, number[]>;
      }>;
    }>(
      `${url}/points`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, with_vector: true }),
      },
    );

    return (response.result || []).map((r) => {
      let vector: number[] | null = null;
      if (Array.isArray(r.vector)) {
        vector = r.vector;
      } else if (r.vector && typeof r.vector === 'object') {
        // dense-only format
        vector = (r.vector as Record<string, number[]>).default || Object.values(r.vector)[0] || null;
      }
      return { id: String(r.id), vector };
    });
  }

  async search(params: QdrantSearchParams): Promise<QdrantSearchResult[]> {
    const { vector, filter, limit } = params;
    const collectionName = params.collectionName || this.collectionName;
    const url = `${this.collectionUrl(collectionName)}/points/search`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body: Record<string, unknown> = {
          vector,
          limit,
          with_payload: true,
          with_vector: false,
        };

        if (filter) {
          body.filter = filter;
        }

        const data = await this.fetchJson<{
          result: Array<{ id: string | number; score: number; version: number; payload?: Record<string, unknown> }>;
        }>(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const results: QdrantSearchResult[] = (data.result || []).map((r) => ({
          id: String(r.id),
          score: r.score,
          version: r.version,
          payload: r.payload,
        }));

        this.logger.log(
          `Qdrant search completed: collection=${collectionName}, returned=${results.length}, attempt=${attempt + 1}`,
        );

        return results;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Qdrant search attempt ${attempt + 1} failed: ${lastError.message}`);

        // 不可重试的客户端错误（4xx 非 429）直接终止，避免无效重试
        const statusMatch = lastError.message.match(/HTTP\s+(\d+)/);
        const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
        if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
          this.logger.error(
            `Qdrant search non-retryable client error: status=${statusCode}, message=${lastError.message}`,
          );
          break;
        }

        // statusCode = 0 表示非 HTTP 错误，需进一步区分
        if (statusCode === 0) {
          const msg = lastError.message.toLowerCase();
          // DNS 解析失败 / 连接拒绝 → 持久性错误，不重试
          if (/econnrefused|enotfound|eaddrinuse|econnreset|dns|resolve|refused|socket/.test(msg)) {
            this.logger.error(
              `Qdrant search non-retryable network error: ${lastError.message}`,
            );
            break;
          }
          // fetch 超时 / AbortError → 可重试但减少次数（只重试 1 次）
          if (/abort|aborted|timeout|timed\s*out/i.test(msg)) {
            if (attempt >= 1) {
              this.logger.warn(
                `Qdrant search timeout exhausted after ${attempt + 1} attempts`,
              );
              break;
            }
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        if (attempt < 2) {
          // Bug 33: 标准指数退避基准 1000ms，与 doubao provider / minio 保持一致
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    const errorMessage = lastError?.message ?? 'unknown error';
    this.logger.error(`Qdrant search failed after 3 attempts: ${errorMessage}`);
    throw Object.assign(new Error(`VECTOR_SEARCH_FAILED: ${errorMessage}`), {
      errorCode: 'VECTOR_SEARCH_FAILED',
      statusCode: 502,
      retryable: true,
    });
  }
}
