import { MaterialFailureCallbackPayload, SliceCallbackPayload } from '../types';
import { SLICING_CONSTANTS } from '../constants';

export class GatewayCallbackClient {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = SLICING_CONSTANTS.GATEWAY_BASE_URL;
  }

  async fetchMaterial(materialId: string): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
  }> {
    const url = `${this.baseUrl}${SLICING_CONSTANTS.GATEWAY_MATERIAL_FETCH_PATH(materialId)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SLICING_CONSTANTS.GATEWAY_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          success: false,
          error: `Gateway material fetch failed: HTTP ${response.status}: ${body}`,
        };
      }

      const body = await response.json();
      return {
        success: body.success ?? true,
        data: body.data ?? body,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Gateway material fetch timed out',
        };
      }

      return {
        success: false,
        error: `Gateway material fetch network error: ${(error as Error).message}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async sendSliceCallback(payload: SliceCallbackPayload): Promise<{
    success: boolean;
    error?: string;
  }> {
    const url = `${this.baseUrl}${SLICING_CONSTANTS.GATEWAY_SLICE_CALLBACK_PATH}`;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLICING_CONSTANTS.GATEWAY_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`[GatewayCallbackClient] Callback succeeded for slice ${payload.slice_id}: HTTP ${response.status}`);
          return { success: true };
        }

        const body = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${body}`;
        console.warn(`[GatewayCallbackClient] Callback failed for slice ${payload.slice_id}: ${lastError} (attempt ${attempt + 1}/${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES})`);

        if (response.status >= 500 && attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES - 1) {
          console.warn(`[GatewayCallbackClient] Server error ${response.status}, retrying callback (attempt ${attempt + 1}/${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES})`);
          await this.delay(SLICING_CONSTANTS.CALLBACK_RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }

        // 4xx 客户端错误不应重试，直接跳出返回失败
        if (response.status >= 400 && response.status < 500) {
          console.error(`[GatewayCallbackClient] Client error ${response.status}, not retrying: ${lastError}`);
          break;
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = 'Callback request timed out';
        } else {
          lastError = (error as Error).message;
        }
        console.warn(`[GatewayCallbackClient] Callback network error for slice ${payload.slice_id}: ${lastError} (attempt ${attempt + 1}/${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES})`);

        if (attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES - 1) {
          console.warn(`[GatewayCallbackClient] Retrying callback (attempt ${attempt + 1}/${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES})`);
          await this.delay(SLICING_CONSTANTS.CALLBACK_RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }
      }
    }

    console.error(`[GatewayCallbackClient] Callback failed after ${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES} attempts for slice ${payload.slice_id}: ${lastError}`);
    return {
      success: false,
      error: `Callback failed after ${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES} attempts: ${lastError}`,
    };
  }

  async sendMaterialFailureCallback(payload: MaterialFailureCallbackPayload): Promise<{
    success: boolean;
    error?: string;
  }> {
    const url = `${this.baseUrl}${SLICING_CONSTANTS.GATEWAY_JOB_FAILURE_CALLBACK_PATH}`;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLICING_CONSTANTS.GATEWAY_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          return { success: true };
        }

        const body = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${body}`;

        if (response.status >= 500 && attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES - 1) {
          console.warn(`[GatewayCallbackClient] Server error ${response.status}, retrying material failure callback (attempt ${attempt + 1}/${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES})`);
          await this.delay(SLICING_CONSTANTS.CALLBACK_RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }
      } catch (error) {
        clearTimeout(timeoutId);

        if (error instanceof Error && error.name === 'AbortError') {
          lastError = 'Material failure callback request timed out';
        } else {
          lastError = (error as Error).message;
        }

        if (attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES - 1) {
          console.warn(`[GatewayCallbackClient] Network error, retrying material failure callback (attempt ${attempt + 1}/${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES}): ${lastError}`);
          await this.delay(SLICING_CONSTANTS.CALLBACK_RETRY_BASE_DELAY_MS * (attempt + 1));
          continue;
        }
      }
    }

    return {
      success: false,
      error: `Material failure callback failed after ${SLICING_CONSTANTS.CALLBACK_MAX_RETRIES} attempts: ${lastError}`,
    };
  }

  async sendBatchCallback(payload: {
    material_id: string;
    trace_id: string;
  }): Promise<{ success: boolean; error?: string }> {
    const url = `${this.baseUrl}/api/internal/v1/materials/batch-callback`;
    let lastError: string | null = null;

    for (let attempt = 0; attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SLICING_CONSTANTS.GATEWAY_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          console.log(`[GatewayCallbackClient] Batch callback succeeded for material ${payload.material_id}`);
          return { success: true };
        }

        const body = await response.text().catch(() => '');
        lastError = `HTTP ${response.status}: ${body}`;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = (error as Error).message;
      }

      if (attempt < SLICING_CONSTANTS.CALLBACK_MAX_RETRIES - 1) {
        await this.delay(SLICING_CONSTANTS.CALLBACK_RETRY_BASE_DELAY_MS * (attempt + 1));
      }
    }

    return { success: false, error: lastError ?? 'Unknown error' };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
