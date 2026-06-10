/**
 * SiliconFlow Client 单元测试
 *
 * 测试：API Key 检查、请求格式、错误处理、重试逻辑
 */

import {
  getSiliconFlowApiKey,
  clearSiliconFlowApiKeyCache,
  SiliconFlowApiError,
  siliconFlowRequestWithRetry,
} from '../../../services/ai/siliconflow-client';

// Mock global fetch
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('SiliconFlow Client', () => {
  const originalKey = process.env.SILICONFLOW_API_KEY;

  beforeAll(() => {
    process.env.SILICONFLOW_API_KEY = 'sk-test-key-12345';
  });

  afterAll(() => {
    process.env.SILICONFLOW_API_KEY = originalKey;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearSiliconFlowApiKeyCache();
  });

  describe('getSiliconFlowApiKey', () => {
    it('should return API key from environment', () => {
      expect(getSiliconFlowApiKey()).toBe('sk-test-key-12345');
    });

    it('should return cached value after first call', () => {
      // First call populates the cache
      getSiliconFlowApiKey();
      // Override env — cached value should still be returned
      process.env.SILICONFLOW_API_KEY = 'should-use-cache';
      clearSiliconFlowApiKeyCache();
      getSiliconFlowApiKey(); // re-populate cache with 'should-use-cache'
      process.env.SILICONFLOW_API_KEY = 'different-value';
      expect(getSiliconFlowApiKey()).toBe('should-use-cache');
    });

    it('should re-read env after cache clear', () => {
      process.env.SILICONFLOW_API_KEY = 'after-clear';
      clearSiliconFlowApiKeyCache();
      expect(getSiliconFlowApiKey()).toBe('after-clear');
    });
  });

  describe('SiliconFlowApiError', () => {
    it('should have correct name, status, and message', () => {
      const error = new SiliconFlowApiError('test error', 429);
      expect(error.name).toBe('SiliconFlowApiError');
      expect(error.status).toBe(429);
      expect(error.message).toBe('test error');
    });
  });

  describe('siliconFlowRequestWithRetry — retry logic', () => {
    beforeEach(() => {
      process.env.SILICONFLOW_API_KEY = 'sk-test-key-12345';
      clearSiliconFlowApiKeyCache();
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        return Promise.resolve(new Response('bad request', { status: 400 }));
      });

      await expect(
        siliconFlowRequestWithRetry('/test', { method: 'POST', body: {} }, 1, 10),
      ).rejects.toThrow(SiliconFlowApiError);

      // 400 should not retry → only 1 attempt
      expect(attempts).toBe(1);
    });

    it('should retry on 429 (rate limit) errors', async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        return Promise.resolve(new Response('rate limited', { status: 429 }));
      });

      await expect(
        siliconFlowRequestWithRetry('/chat/completions', { method: 'POST', body: {} }, 2, 10),
      ).rejects.toThrow(SiliconFlowApiError);

      expect(attempts).toBe(3); // 1 original + 2 retries
    });

    it('should retry on 5xx errors', async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        return Promise.resolve(new Response('server error', { status: 500 }));
      });

      await expect(
        siliconFlowRequestWithRetry('/chat/completions', { method: 'POST', body: {} }, 2, 10),
      ).rejects.toThrow(SiliconFlowApiError);

      expect(attempts).toBe(3);
    });

    it('should succeed on retry after first failure', async () => {
      let attempts = 0;
      mockFetch.mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve(new Response('server error', { status: 500 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      });

      const result = await siliconFlowRequestWithRetry<{ choices: any[] }>(
        '/chat/completions',
        { method: 'POST', body: { test: true } },
        2,
        10,
      );

      expect(attempts).toBe(2);
      expect(result.ok).toBe(true);
      expect(result.data.choices[0].message.content).toBe('ok');
    });
  });

  describe('siliconFlowRequestWithRetry — response handling', () => {
    beforeEach(() => {
      process.env.SILICONFLOW_API_KEY = 'sk-test-key-12345';
      clearSiliconFlowApiKeyCache();
    });

    it('should parse JSON response correctly', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: 'hello' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await siliconFlowRequestWithRetry<{ data: string }>(
        '/chat/completions',
        { method: 'POST', body: {} },
        1,
        10,
      );

      expect(result.ok).toBe(true);
      expect(result.data.data).toBe('hello');
    });

    it('should throw SiliconFlowApiError on HTTP non-OK', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404,
        }),
      );

      await expect(
        siliconFlowRequestWithRetry('/nonexistent', { method: 'POST', body: {} }, 0, 10),
      ).rejects.toThrow(SiliconFlowApiError);
    });

    it('should throw wrapped error on network error after exhausting retries', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      await expect(
        siliconFlowRequestWithRetry('/test', { method: 'POST', body: {} }, 2, 10),
      ).rejects.toThrow('Request failed after 2 retries: Connection refused');
    });
  });
});
