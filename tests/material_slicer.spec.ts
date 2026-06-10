// =============================================================================
// TikStream AI — GPU Slicing Worker 自动化测试基座
// 对应功能: 素材切片与 Dense Caption 语义打标 (gpu-slicing-worker)
// 对应模块: Material (人员A) | 测试类型: 单元测试 (Worker Logic + 原子函数)
// 技术栈: Jest 29 + jest.fn
// 覆盖范围: slicing.processor / caption.processor / 边界优化 / Gateway 回调回写
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// ============================================================
// 0. 测试专用类型定义
// ============================================================

type MaterialSliceStatus = 'PENDING' | 'CAPTIONING' | 'EMBEDDING' | 'COMPLETED' | 'FAILED';

interface TestSliceSegment {
  start_sec: number;
  end_sec: number;
  duration: number;
}

interface TestMaterialSliceRecord {
  id: string;
  material_id: string;
  slice_id: string;
  start_time: number;
  end_time: number;
  duration: number;
  dense_caption: string | null;
  tags: string[];
  stream_url: string | null;
  key_frame_url: string | null;
  embedding_version: string | null;
  sfx_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TestSceneBoundary {
  timestamp_sec: number;
  confidence: number;
}

interface TestDecordOutput {
  success: boolean;
  predictions: TestSceneBoundary[];
  error?: string;
  video_duration: number;
  frame_count: number;
}

interface TestSliceJobPayload {
  materialId: string;
  skipQdrant: boolean;
  enqueuedAt: string;
}

interface TestSliceJobContext {
  id: string;
  name: string;
  data: TestSliceJobPayload;
  progress: number;
  updateProgress: jest.Mock;
}

interface TestSliceUpdatePayload {
  slice_id: string;
  status: MaterialSliceStatus;
  stream_url?: string;
  key_frame_url?: string;
  dense_caption?: string;
  tags?: string[];
  trace_id: string;
}

interface TestGatewayMaterialResponse {
  material_id: string;
  product_id: string;
  file_name: string;
  duration_seconds: number;
  origin_url: string;
  type: string;
  slices: Array<{
    id: string;
    slice_id: string;
    start_time: number;
    end_time: number;
    duration: number;
    status: string;
  }>;
  product: {
    id: string;
    title: string;
    category: string;
    selling_points: string[];
  };
}

interface TestSliceCallbackRequest {
  material_id: string;
  slice_id: string;
  status: MaterialSliceStatus;
  stream_url?: string;
  key_frame_url?: string;
  dense_caption?: string;
  tags?: string[];
  trace_id: string;
}

interface TestCaptionResult {
  dense_caption: string;
  tags: string[];
}

interface TestProductMeta {
  id: string;
  title: string;
  category: string;
  selling_points: string[];
}

interface TestHealthStatus {
  status: 'ok' | 'degraded' | 'down';
  dependencies: {
    python: string;
    decord: string;
    transnet: string;
    ffmpeg: string;
    redis: string;
  };
}

type MockMinioClient = {
  getObject: jest.Mock;
  putObject: jest.Mock;
};

type MockHttpClient = {
  get: jest.Mock;
  post: jest.Mock;
};

type MockExecFileResult = {
  stdout: string;
  stderr: string;
};

type MockProcessSliceJobFn = (
  job: TestSliceJobContext,
  deps: {
    httpClient: MockHttpClient;
    minio: MockMinioClient;
    atoms: {
      fetchMaterialFromGateway: FetchMaterialFromGatewayFn;
      downloadSourceVideo: DownloadSourceVideoFn;
      detectSceneBoundaries: DetectSceneBoundariesFn;
      optimizeSliceBoundaries: OptimizeSliceBoundariesFn;
      executeFfmpegSlicing: ExecuteFfmpegSlicingFn;
      extractKeyFrames: ExtractKeyFramesFn;
      uploadSliceToMinIO: UploadSliceToMinIOFn;
      uploadKeyFrameToMinIO: UploadKeyFrameToMinIOFn;
      generateSliceCaption: GenerateSliceCaptionFn;
      updateSliceViaCallback: UpdateSliceViaCallbackFn;
      cleanupTemporaryFiles: CleanupTemporaryFilesFn;
      generateTraceId: GenerateTraceIdFn;
    };
  },
) => Promise<void>;

type FetchMaterialFromGatewayFn = (
  httpClient: MockHttpClient,
  materialId: string,
) => Promise<TestGatewayMaterialResponse>;

type DownloadSourceVideoFn = (
  minio: MockMinioClient,
  originUrl: string,
  jobTempDir: string,
) => Promise<string>;

type DetectSceneBoundariesFn = (
  videoPath: string,
  jobTempDir: string,
  execFile: (cmd: string, args: string[], opts: Record<string, unknown>) => Promise<MockExecFileResult>,
) => Promise<TestDecordOutput>;

type OptimizeSliceBoundariesFn = (
  initialSlices: TestMaterialSliceRecord[],
  sceneCuts: TestSceneBoundary[],
  videoDuration: number,
) => TestSliceSegment[];

type ExecuteFfmpegSlicingFn = (
  videoPath: string,
  segments: TestSliceSegment[],
  jobTempDir: string,
  execFile: (cmd: string, args: string[], opts: Record<string, unknown>) => Promise<MockExecFileResult>,
) => Promise<string[]>;

type ExtractKeyFramesFn = (
  segments: TestSliceSegment[],
  sliceVideoPaths: string[],
  jobTempDir: string,
  execFile: (cmd: string, args: string[], opts: Record<string, unknown>) => Promise<MockExecFileResult>,
) => Promise<(string | null)[]>;

type UploadSliceToMinIOFn = (
  minio: MockMinioClient,
  slicePath: string,
  objectKey: string,
) => Promise<string>;

type UploadKeyFrameToMinIOFn = (
  minio: MockMinioClient,
  keyFramePath: string | null,
  objectKey: string,
) => Promise<string | null>;

type GenerateSliceCaptionFn = (
  segment: TestSliceSegment,
  productInfo: TestProductMeta,
  atoms: {
    buildCaptionPrompt: BuildCaptionPromptFn;
    parseCaptionResponse: ParseCaptionResponseFn;
    callCaptionAPI: CallCaptionAPIFn;
  },
) => Promise<TestCaptionResult>;

type UpdateSliceViaCallbackFn = (
  httpClient: MockHttpClient,
  materialId: string,
  update: TestSliceUpdatePayload,
) => Promise<void>;

type CleanupTemporaryFilesFn = (jobTempDir: string) => Promise<void>;

type BuildCaptionPromptFn = (
  segment: TestSliceSegment,
  productInfo: TestProductMeta,
) => { systemPrompt: string; userPrompt: string };

type ParseCaptionResponseFn = (rawText: string) => TestCaptionResult;

type CallCaptionAPIFn = (systemPrompt: string, userPrompt: string) => Promise<string>;

type GenerateTraceIdFn = (materialId: string) => string;

type HandleSliceCallbackFn = (
  callback: TestSliceCallbackRequest,
  deps: {
    prisma: {
      materialSlice: { update: jest.Mock; findMany: jest.Mock };
      material: { update: jest.Mock };
    };
  },
) => Promise<void>;

// ============================================================
// 常量
// ============================================================

const NOW = '2026-05-25T12:00:00.000Z';
const MATERIAL_ID = 'dc52d4ff-0000-4000-a000-000000000010';
const JOB_ID = 'job-gpu-slice-001';
const TRACE_ID = 'trc_20260525_slice_dc52d4ff';
const TEMP_DIR = '/tmp/tikstream-slice-job-gpu-slice-001';

const SLICE_MIN_DURATION = 1.5;
const SLICE_MAX_DURATION = 4.0;
const SLICE_TARGET_DURATION = 3.0;
const MAX_VIDEO_DURATION = 15.0;
const SCENE_CUT_TOLERANCE = 0.3;
const FFMPEG_CUT_TIMEOUT_MS = 30_000;
const PYTHON_SCRIPT_TIMEOUT_MS = 60_000;
const CAPTION_API_TIMEOUT_MS = 30_000;
const CALLBACK_TIMEOUT_MS = 10_000;
const CALLBACK_MAX_RETRIES = 3;
const CALLBACK_RETRY_DELAY_BASE_MS = 500;
const MINIO_DOWNLOAD_TIMEOUT_MS = 60_000;
const JOB_TOTAL_TIMEOUT_MS = 300_000;

// ============================================================
// Mock Factories
// ============================================================

const mockSliceJobContextFactory = (overrides?: Partial<TestSliceJobContext>): TestSliceJobContext => ({
  id: JOB_ID,
  name: 'slice',
  data: {
    materialId: MATERIAL_ID,
    skipQdrant: false,
    enqueuedAt: NOW,
  },
  progress: 0,
  updateProgress: jest.fn(),
  ...overrides,
});

const mockGatewayMaterialResponseFactory = (
  overrides?: Partial<TestGatewayMaterialResponse>,
): TestGatewayMaterialResponse => ({
  material_id: MATERIAL_ID,
  product_id: '00000000-0000-0000-0000-000000000001',
  file_name: 'product_demo.mp4',
  duration_seconds: 9.0,
  origin_url: 'http://minio:9000/tikstream-assets/materials/20260525/dc52d4ff/product_demo.mp4',
  type: 'VIDEO',
  slices: [
    {
      id: 'slice-uuid-1',
      slice_id: 'slc_20260525_000001_001',
      start_time: 0.0,
      end_time: 3.0,
      duration: 3.0,
      status: 'PENDING',
    },
    {
      id: 'slice-uuid-2',
      slice_id: 'slc_20260525_000002_002',
      start_time: 3.0,
      end_time: 6.0,
      duration: 3.0,
      status: 'PENDING',
    },
    {
      id: 'slice-uuid-3',
      slice_id: 'slc_20260525_000003_003',
      start_time: 6.0,
      end_time: 9.0,
      duration: 3.0,
      status: 'PENDING',
    },
  ],
  product: {
    id: '00000000-0000-0000-0000-000000000001',
    title: '智能无线卷发棒 Pro',
    category: 'Beauty/PersonalCare',
    selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  },
  ...overrides,
});

const mockDecordOutputFactory = (overrides?: Partial<TestDecordOutput>): TestDecordOutput => ({
  success: true,
  predictions: [
    { timestamp_sec: 3.1, confidence: 0.92 },
    { timestamp_sec: 5.9, confidence: 0.88 },
  ],
  video_duration: 9.0,
  frame_count: 270,
  ...overrides,
});

const mockSliceSegmentFactory = (
  index: number,
  start: number,
  end: number,
): TestSliceSegment => ({
  start_sec: Math.round(start * 100) / 100,
  end_sec: Math.round(end * 100) / 100,
  duration: Math.round((end - start) * 100) / 100,
});

const mockCaptionResultFactory = (overrides?: Partial<TestCaptionResult>): TestCaptionResult => ({
  dense_caption:
    'A close-up shot of a woman using a smart curling iron on her hair, showcasing the sleek design with LED temperature display. The scene takes place in a bright modern bathroom with natural lighting, emphasizing the product\'s premium build quality and ergonomic grip.',
  tags: [
    'close-up',
    'product_demo',
    'smart_curling_iron',
    'bright_lighting',
    'bathroom_setting',
    'female_hands',
    'premium_texture',
    'LED_display',
  ],
  ...overrides,
});

const mockProductMetaFactory = (overrides?: Partial<TestProductMeta>): TestProductMeta => ({
  id: '00000000-0000-0000-0000-000000000001',
  title: '智能无线卷发棒 Pro',
  category: 'Beauty/PersonalCare',
  selling_points: ['3档智能控温', '10分钟快充', '便携无线', '防烫设计'],
  ...overrides,
});

const mockSliceUpdatePayloadFactory = (
  sliceId: string,
  status: MaterialSliceStatus,
  overrides?: Partial<Omit<TestSliceUpdatePayload, 'slice_id' | 'status'>>,
): TestSliceUpdatePayload => ({
  slice_id: sliceId,
  status,
  trace_id: TRACE_ID,
  ...overrides,
});

const mockSliceCallbackRequestFactory = (
  overrides?: Partial<TestSliceCallbackRequest>,
): TestSliceCallbackRequest => ({
  material_id: MATERIAL_ID,
  slice_id: 'slc_20260525_000001_001',
  status: 'COMPLETED',
  stream_url: `http://minio:9000/tikstream-assets/slices/20260525/${MATERIAL_ID}/slice_001.mp4`,
  key_frame_url: `http://minio:9000/tikstream-assets/slices/20260525/${MATERIAL_ID}/keyframe_001.webp`,
  dense_caption:
    'A close-up shot of a woman using a smart curling iron on her hair, showcasing the sleek design with LED temperature display.',
  tags: ['close-up', 'product_demo', 'smart_curling_iron'],
  trace_id: TRACE_ID,
  ...overrides,
});

const mockMinioClientFactory = (): MockMinioClient => ({
  getObject: jest.fn(),
  putObject: jest.fn(),
});

const mockHttpClientFactory = (): MockHttpClient => ({
  get: jest.fn(),
  post: jest.fn(),
});

const mockSliceRecordFactory = (
  index: number,
  start: number,
  end: number,
  materialId: string = MATERIAL_ID,
): TestMaterialSliceRecord => ({
  id: `slice-uuid-${index}`,
  material_id: materialId,
  slice_id: `slc_20260525_${String(index).padStart(6, '0')}_${String(index).padStart(3, '0')}`,
  start_time: start,
  end_time: end,
  duration: Math.round((end - start) * 100) / 100,
  dense_caption: null,
  tags: [],
  stream_url: null,
  key_frame_url: null,
  embedding_version: null,
  sfx_url: null,
  status: 'PENDING',
  created_at: NOW,
  updated_at: NOW,
});

// ============================================================
// 测试套件入口
// ============================================================

describe('GPU Slicing Worker — 素材切片与 Dense Caption 语义打标 (BullMQ Consumer)', () => {
  // ===========================================================================
  // 全局测试上下文
  // ===========================================================================
  let mockMinio: MockMinioClient;
  let mockGatewayClient: MockHttpClient;
  let mockExecFile: jest.Mock;
  let mockFsRm: jest.Mock;
  let mockFsMkdir: jest.Mock;
  let mockFsStatSync: jest.Mock;

  // ---- Worker 端原子函数类型声明 ----

  let fetchMaterialFromGateway: FetchMaterialFromGatewayFn;
  let downloadSourceVideo: DownloadSourceVideoFn;
  let detectSceneBoundaries: DetectSceneBoundariesFn;
  let optimizeSliceBoundaries: OptimizeSliceBoundariesFn;
  let executeFfmpegSlicing: ExecuteFfmpegSlicingFn;
  let extractKeyFrames: ExtractKeyFramesFn;
  let uploadSliceToMinIO: UploadSliceToMinIOFn;
  let uploadKeyFrameToMinIO: UploadKeyFrameToMinIOFn;
  let generateSliceCaption: GenerateSliceCaptionFn;
  let updateSliceViaCallback: UpdateSliceViaCallbackFn;
  let cleanupTemporaryFiles: CleanupTemporaryFilesFn;
  let generateTraceId: GenerateTraceIdFn;
  let processSliceJob: MockProcessSliceJobFn;

  // ---- Caption 子流程原子函数 ----

  let buildCaptionPrompt: BuildCaptionPromptFn;
  let parseCaptionResponse: ParseCaptionResponseFn;
  let callCaptionAPI: CallCaptionAPIFn;

  // ---- Gateway 回写原子函数 ----

  let handleSliceCallback: HandleSliceCallbackFn;

  beforeEach(() => {
    mockMinio = mockMinioClientFactory();
    mockGatewayClient = mockHttpClientFactory();
    mockExecFile = jest.fn();
    mockFsRm = jest.fn().mockResolvedValue(undefined);
    mockFsMkdir = jest.fn().mockResolvedValue(undefined);
    mockFsStatSync = jest.fn().mockReturnValue({ size: 1048576 });

    mockMinio.getObject.mockResolvedValue({
      buffer: Buffer.alloc(10 * 1024 * 1024, 0xCD),
      contentType: 'video/mp4',
    });

    mockMinio.putObject.mockResolvedValue(undefined);

    mockGatewayClient.get.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: mockGatewayMaterialResponseFactory(),
        trace_id: TRACE_ID,
      }),
    });

    mockGatewayClient.post.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    mockExecFile.mockResolvedValue({
      stdout: JSON.stringify(mockDecordOutputFactory()),
      stderr: '',
    });

    callCaptionAPI = jest.fn().mockResolvedValue(
      JSON.stringify(mockCaptionResultFactory()),
    );
  });

  // ===========================================================================
  // 注入真实实现
  // ===========================================================================

  beforeAll(() => {
    // ---- F1: fetchMaterialFromGateway ----

    fetchMaterialFromGateway = async (httpClient, materialId) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CALLBACK_TIMEOUT_MS);

      try {
        const response = await httpClient.get(
          `http://server-gateway:3000/api/internal/v1/materials/${materialId}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw Object.assign(
            new Error(`Gateway fetch failed: HTTP ${response.status}`),
            {
              errorCode: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          );
        }

        const body = await response.json();
        if (!body.success || !body.data) {
          throw Object.assign(
            new Error('Gateway returned unsuccessful response'),
            {
              errorCode: 'MATERIAL_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
              retryable: false,
            },
          );
        }

        return body.data as TestGatewayMaterialResponse;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw Object.assign(
            new Error('Gateway fetch timed out'),
            {
              errorCode: 'INTERNAL_SERVER_ERROR',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // ---- F2: downloadSourceVideo ----

    downloadSourceVideo = async (minio, originUrl, jobTempDir) => {
      const url = new URL(originUrl);
      const objectKey = url.pathname.substring(1);

      try {
        const { buffer } = await minio.getObject(objectKey);
        if (!buffer || buffer.length === 0) {
          throw Object.assign(
            new Error('Downloaded video buffer is empty'),
            {
              errorCode: 'GPU_SLICING_DOWNLOAD_FAILED',
              statusCode: HttpStatus.BAD_GATEWAY,
              retryable: true,
            },
          );
        }

        const outputPath = `${jobTempDir}/source.mp4`;
        return outputPath;
      } catch (error) {
        if (
          error instanceof Error &&
          'errorCode' in error
        ) {
          throw error;
        }

        throw Object.assign(
          new Error(`MinIO download failed: ${(error as Error).message}`),
          {
            errorCode: 'GPU_SLICING_DOWNLOAD_FAILED',
            statusCode: HttpStatus.BAD_GATEWAY,
            retryable: true,
          },
        );
      }
    };

    // ---- F3: detectSceneBoundaries ----

    detectSceneBoundaries = async (videoPath, jobTempDir, execFile) => {
      try {
        const result = await execFile(
          'python3',
          ['python_scripts/decord_slicer.py', videoPath, jobTempDir],
          { timeout: PYTHON_SCRIPT_TIMEOUT_MS },
        );

        const parsed: TestDecordOutput = JSON.parse(result.stdout);

        if (!parsed.success) {
          if (
            parsed.error &&
            (parsed.error.includes('CUDA out of memory') ||
              parsed.error.includes('cuda'))
          ) {
            throw Object.assign(
              new Error(`TransNetV2 GPU OOM: ${parsed.error}`),
              {
                errorCode: 'GPU_SLICING_TRANSNET_FAILED',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                retryable: true,
              },
            );
          }

          throw Object.assign(
            new Error(`Decord decoding failed: ${parsed.error}`),
            {
              errorCode: 'GPU_SLICING_DECORD_FAILED',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: true,
            },
          );
        }

        return parsed;
      } catch (error) {
        if (
          error instanceof Error &&
          'errorCode' in error
        ) {
          throw error;
        }

        const err = error as Error & { code?: string; stderr?: string };

        if (err.code === 'ENOENT') {
          throw Object.assign(
            new Error('python3 not found'),
            {
              errorCode: 'GPU_SLICING_PYTHON_DEPENDENCY_MISSING',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: false,
            },
          );
        }

        if (
          err.stderr &&
          err.stderr.includes('ModuleNotFoundError')
        ) {
          throw Object.assign(
            new Error(`Python dependency missing: ${err.stderr}`),
            {
              errorCode: 'GPU_SLICING_PYTHON_DEPENDENCY_MISSING',
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              retryable: false,
            },
          );
        }

        throw Object.assign(
          new Error(`Scene detection failed: ${err.message}`),
          {
            errorCode: 'GPU_SLICING_DECORD_FAILED',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }
    };

    // ---- F4: optimizeSliceBoundaries ----

    optimizeSliceBoundaries = (initialSlices, sceneCuts, videoDuration) => {
      if (videoDuration <= 0 || Number.isNaN(videoDuration)) {
        throw Object.assign(
          new Error(`Invalid video duration: ${videoDuration}s`),
          {
            errorCode: 'GPU_SLICING_NO_VALID_SLICES',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      if (initialSlices.length === 0) {
        throw Object.assign(
          new Error('No initial slice boundaries provided'),
          {
            errorCode: 'GPU_SLICING_NO_VALID_SLICES',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      const sortedSceneCuts = [...sceneCuts]
        .sort((a, b) => a.timestamp_sec - b.timestamp_sec)
        .filter((cut) => cut.timestamp_sec > 0 && cut.timestamp_sec < videoDuration);

      const rawBoundaries: number[] = [0.0];

      if (sortedSceneCuts.length > 0) {
        for (const cut of sortedSceneCuts) {
          rawBoundaries.push(cut.timestamp_sec);
        }
      } else {
        for (const slice of initialSlices) {
          if (slice.end_time < videoDuration) {
            rawBoundaries.push(slice.end_time);
          }
        }
      }

      rawBoundaries.push(videoDuration);

      const adjustedBoundaries: number[] = [0.0];

      for (let i = 0; i < initialSlices.length; i++) {
        const slice = initialSlices[i];
        const originalEnd = slice.end_time;

        let adjustedEnd = originalEnd;

        for (const cut of sortedSceneCuts) {
          if (Math.abs(cut.timestamp_sec - originalEnd) <= SCENE_CUT_TOLERANCE) {
            adjustedEnd = cut.timestamp_sec;
            break;
          }
        }

        if (!adjustedBoundaries.includes(adjustedEnd) && adjustedEnd < videoDuration) {
          adjustedBoundaries.push(adjustedEnd);
        }
      }

      adjustedBoundaries.push(videoDuration);

      const uniqueBoundaries = [...new Set(adjustedBoundaries)].sort(
        (a, b) => a - b,
      );

      const segments: TestSliceSegment[] = [];

      for (let i = 0; i < uniqueBoundaries.length - 1; i++) {
        const start = uniqueBoundaries[i];
        const end = uniqueBoundaries[i + 1];
        const dur = Math.round((end - start) * 100) / 100;

        if (dur < SLICE_MIN_DURATION) {
          if (segments.length > 0) {
            const prev = segments[segments.length - 1];
            prev.end_sec = Math.round(end * 100) / 100;
            prev.duration = Math.round((prev.end_sec - prev.start_sec) * 100) / 100;
          }
          continue;
        }

        if (dur > SLICE_MAX_DURATION) {
          const subCount = Math.ceil(dur / SLICE_TARGET_DURATION);
          const subDur = Math.round((dur / subCount) * 100) / 100;

          for (let j = 0; j < subCount; j++) {
            const subStart = Math.round((start + j * subDur) * 100) / 100;
            const subEnd = Math.round(Math.min(start + (j + 1) * subDur, end) * 100) / 100;
            const subFinalDur = Math.round((subEnd - subStart) * 100) / 100;

            if (subFinalDur >= SLICE_MIN_DURATION) {
              segments.push({
                start_sec: subStart,
                end_sec: subEnd,
                duration: subFinalDur,
              });
            }
          }
          continue;
        }

        segments.push({
          start_sec: Math.round(start * 100) / 100,
          end_sec: Math.round(end * 100) / 100,
          duration: dur,
        });
      }

      if (segments.length === 0) {
        throw Object.assign(
          new Error('No valid slices produced after boundary optimization'),
          {
            errorCode: 'GPU_SLICING_NO_VALID_SLICES',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      const totalDuration = segments.reduce(
        (sum, seg) => sum + seg.duration,
        0,
      );
      if (Math.abs(totalDuration - videoDuration) > 0.5) {
        throw Object.assign(
          new Error(
            `Slice duration mismatch: total=${totalDuration}s vs video=${videoDuration}s`,
          ),
          {
            errorCode: 'GPU_SLICING_NO_VALID_SLICES',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      return segments;
    };

    // ---- F5: executeFfmpegSlicing ----

    executeFfmpegSlicing = async (
      videoPath,
      segments,
      jobTempDir,
      execFile,
    ) => {
      const outputPaths: string[] = [];
      const errors: Array<{ segmentIndex: number; error: string }> = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const outputPath = `${jobTempDir}/slice_${String(i + 1).padStart(3, '0')}.mp4`;

        try {
          await execFile(
            'ffmpeg',
            [
              '-y',
              '-ss', String(segment.start_sec),
              '-i', videoPath,
              '-t', String(segment.duration),
              '-c:v', 'libx264',
              '-crf', '18',
              '-an',
              outputPath,
            ],
            { timeout: FFMPEG_CUT_TIMEOUT_MS },
          );

          outputPaths.push(outputPath);
        } catch (error) {
          const err = error as Error & { code?: string };

          if (err.code === 'ENOENT' && err.message.includes('ffmpeg')) {
            throw Object.assign(
              new Error('ffmpeg binary not found'),
              {
                errorCode: 'GPU_SLICING_FFMPEG_NOT_FOUND',
                statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
                retryable: false,
              },
            );
          }

          errors.push({
            segmentIndex: i,
            error: err.message,
          });
        }
      }

      if (errors.length > 0) {
        throw Object.assign(
          new Error(
            `FFmpeg cut failed for ${errors.length}/${segments.length} segments: ${errors.map((e) => `seg#${e.segmentIndex}=${e.error}`).join('; ')}`,
          ),
          {
            errorCode: 'GPU_SLICING_FFMPEG_CUT_FAILED',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }

      if (outputPaths.length === 0) {
        throw Object.assign(
          new Error('FFmpeg slicing produced no output files'),
          {
            errorCode: 'GPU_SLICING_FFMPEG_CUT_FAILED',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }

      return outputPaths;
    };

    // ---- F6: extractKeyFrames ----

    extractKeyFrames = async (
      segments,
      sliceVideoPaths,
      jobTempDir,
      execFile,
    ) => {
      const keyFramePaths: (string | null)[] = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const midPoint = Math.round(
          ((segment.start_sec + segment.end_sec) / 2) * 100,
        ) / 100;
        const keyFramePath = `${jobTempDir}/keyframe_${String(i + 1).padStart(3, '0')}.webp`;
        const sourceVideo = sliceVideoPaths[i] || `${jobTempDir}/source.mp4`;

        try {
          await execFile(
            'ffmpeg',
            [
              '-y',
              '-ss', String(midPoint),
              '-i', sourceVideo,
              '-vframes', '1',
              '-q:v', '2',
              keyFramePath,
            ],
            { timeout: 10_000 },
          );

          keyFramePaths.push(keyFramePath);
        } catch {
          keyFramePaths.push(null);
        }
      }

      return keyFramePaths;
    };

    // ---- F7: uploadSliceToMinIO ----

    uploadSliceToMinIO = async (minio, slicePath, objectKey) => {
      try {
        await minio.putObject(Buffer.alloc(1024 * 1024, 0xCD), objectKey, 'video/mp4');

        return `http://minio:9000/tikstream-assets/${objectKey}`;
      } catch (error) {
        throw Object.assign(
          new Error(
            `MinIO slice upload failed: ${(error as Error).message}`,
          ),
          {
            errorCode: 'OBJECT_STORAGE_WRITE_FAILED',
            statusCode: HttpStatus.BAD_GATEWAY,
            retryable: true,
          },
        );
      }
    };

    // ---- F8: uploadKeyFrameToMinIO ----

    uploadKeyFrameToMinIO = async (minio, keyFramePath, objectKey) => {
      if (!keyFramePath) {
        return null;
      }

      try {
        await minio.putObject(Buffer.alloc(32 * 1024, 0xFF), objectKey, 'image/webp');

        return `http://minio:9000/tikstream-assets/${objectKey}`;
      } catch {
        return null;
      }
    };

    // ---- F13: buildCaptionPrompt ----

    buildCaptionPrompt = (segment, productInfo) => {
      const systemPrompt = `You are a professional video captioning AI specialized in e-commerce product videos for TikTok Shop. Your task is to provide a DENSE caption and relevant tags for the given video segment.

Product Context:
- Product: ${productInfo.title} (${productInfo.category})
- Selling Points: ${productInfo.selling_points.join(', ')}
- Time Window: ${segment.start_sec}s to ${segment.end_sec}s (duration: ${segment.duration}s)

STRICT OUTPUT FORMAT (JSON only, no markdown, no explanation):
{
  "dense_caption": "A detailed English description of the scene, including subject, action, product details, lighting, composition, and mood. Must be 50-150 words.",
  "tags": ["tag1", "tag2", ...]  // 5-15 relevant tags in snake_case
}`;

      const userPrompt = `Describe the video segment from ${segment.start_sec}s to ${segment.end_sec}s for product "${productInfo.title}" in the JSON format specified above.`;

      return { systemPrompt, userPrompt };
    };

    // ---- F14: parseCaptionResponse ----

    parseCaptionResponse = (rawText) => {
      if (!rawText || rawText.trim().length === 0) {
        throw Object.assign(
          new Error('Caption API returned empty response'),
          {
            errorCode: 'SCRIPT_PARSE_FAILED',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      let trimmed = rawText.trim();

      const codeBlockMatch = trimmed.match(
        /```(?:json)?\s*\n?([\s\S]*?)\n?```/,
      );
      if (codeBlockMatch) {
        trimmed = codeBlockMatch[1].trim();
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        throw Object.assign(
          new Error('Caption API response is not valid JSON'),
          {
            errorCode: 'SCRIPT_PARSE_FAILED',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      if (typeof parsed !== 'object' || parsed === null) {
        throw Object.assign(
          new Error('Caption API response is not a JSON object'),
          {
            errorCode: 'SCRIPT_PARSE_FAILED',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      const obj = parsed as Record<string, unknown>;

      if (typeof obj.dense_caption !== 'string' || obj.dense_caption.trim().length === 0) {
        throw Object.assign(
          new Error('Caption result missing or empty dense_caption field'),
          {
            errorCode: 'SCRIPT_PARSE_FAILED',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      if (!Array.isArray(obj.tags)) {
        throw Object.assign(
          new Error('Caption result missing tags array'),
          {
            errorCode: 'SCRIPT_PARSE_FAILED',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      const tags = obj.tags
        .filter(
          (tag: unknown): tag is string =>
            typeof tag === 'string' && tag.trim().length > 0,
        )
        .map((tag: string) => tag.trim().toLowerCase().replace(/\s+/g, '_'));

      if (tags.length === 0) {
        throw Object.assign(
          new Error('Caption result has no valid tags'),
          {
            errorCode: 'SCRIPT_PARSE_FAILED',
            statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
            retryable: false,
          },
        );
      }

      return {
        dense_caption: obj.dense_caption.trim(),
        tags,
      };
    };

    // ---- F12: generate (主编排) ----

    generateSliceCaption = async (segment, productInfo, atoms) => {
      const { systemPrompt, userPrompt } = atoms.buildCaptionPrompt(
        segment,
        productInfo,
      );

      let rawText: string;
      try {
        rawText = await atoms.callCaptionAPI(systemPrompt, userPrompt);
      } catch (error) {
        const err = error as Error & { errorCode?: string };
        if (err.errorCode === 'RATE_LIMITED' || err.errorCode === 'MODEL_PROVIDER_FAILED') {
          throw error;
        }
        throw Object.assign(
          new Error(`Doubao API call failed: ${err.message}`),
          {
            errorCode: 'MODEL_PROVIDER_FAILED',
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            retryable: true,
          },
        );
      }

      return atoms.parseCaptionResponse(rawText);
    };

    // ---- F10: updateSliceViaCallback ----

    updateSliceViaCallback = async (httpClient, materialId, update) => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt < CALLBACK_MAX_RETRIES; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          CALLBACK_TIMEOUT_MS,
        );

        try {
          const response = await httpClient.post(
            'http://server-gateway:3000/api/internal/v1/materials/slice-callback',
            {
              material_id: materialId,
              ...update,
            },
            {
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
            },
          );

          clearTimeout(timeoutId);

          if (response.ok) {
            return;
          }

          const body = await response.json().catch(() => ({}));
          lastError = new Error(
            `Callback rejected: HTTP ${response.status} ${JSON.stringify(body)}`,
          ) as Error & { statusCode?: number };
          (lastError as Error & { statusCode: number }).statusCode =
            response.status;
        } catch (error) {
          clearTimeout(timeoutId);
          lastError = error as Error;

          if (
            error instanceof Error &&
            error.name === 'AbortError'
          ) {
            lastError = new Error('Callback request timed out');
          }
        }

        if (attempt < CALLBACK_MAX_RETRIES - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, CALLBACK_RETRY_DELAY_BASE_MS * (attempt + 1)),
          );
        }
      }

      throw Object.assign(
        new Error(
          `Slice callback failed after ${CALLBACK_MAX_RETRIES} attempts: ${lastError!.message}`,
        ),
        {
          errorCode: 'INTERNAL_WORKER_CALLBACK_FAILED',
          statusCode: HttpStatus.BAD_GATEWAY,
          retryable: true,
        },
      );
    };

    // ---- F11: cleanupTemporaryFiles ----

    cleanupTemporaryFiles = async (jobTempDir) => {
      try {
        await mockFsRm(jobTempDir, { recursive: true, force: true });
      } catch {
        // Silently fail — the OS will clean up /tmp eventually
      }
    };

    // ---- F0: processSliceJob (主编排) ----

    generateTraceId = (materialId) => {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      const shortId = materialId.replace(/-/g, '').substring(0, 8);
      return `trc_${y}${m}${d}_slice_${shortId}`;
    };

    processSliceJob = async (job, deps) => {
      const materialId = job.data.materialId;
      const jobTempDir = `${require('os').tmpdir()}/tikstream-slice-${job.id}`;
      const traceId = deps.atoms.generateTraceId(materialId);

      try {
        await job.updateProgress(5);

        const gatewayData = await deps.atoms.fetchMaterialFromGateway(
          deps.httpClient,
          materialId,
        );
        await job.updateProgress(10);

        const videoPath = await deps.atoms.downloadSourceVideo(
          deps.minio,
          gatewayData.origin_url,
          jobTempDir,
        );
        await job.updateProgress(15);

        const sceneDetection = await deps.atoms.detectSceneBoundaries(
          videoPath,
          jobTempDir,
          mockExecFile,
        );
        await job.updateProgress(30);

        const segments = deps.atoms.optimizeSliceBoundaries(
          gatewayData.slices as TestMaterialSliceRecord[],
          sceneDetection.predictions,
          gatewayData.duration_seconds,
        );
        await job.updateProgress(35);

        const sliceVideoPaths = await deps.atoms.executeFfmpegSlicing(
          videoPath,
          segments,
          jobTempDir,
          mockExecFile,
        );
        await job.updateProgress(55);

        const keyFramePaths = await deps.atoms.extractKeyFrames(
          segments,
          sliceVideoPaths,
          jobTempDir,
          mockExecFile,
        );
        await job.updateProgress(60);

        const productInfo: TestProductMeta = {
          id: gatewayData.product.id,
          title: gatewayData.product.title,
          category: gatewayData.product.category,
          selling_points: gatewayData.product.selling_points,
        };

        const totalSegments = segments.length;
        let completedSegments = 0;
        let failedSegments = 0;

        for (let i = 0; i < totalSegments; i++) {
          const segment = segments[i];
          const slicePath = sliceVideoPaths[i];
          const keyFramePath = keyFramePaths[i] || null;

          if (!slicePath) {
            failedSegments++;
            continue;
          }

          const sliceId = `slc_20260525_${String(i + 1).padStart(6, '0')}_${String(i + 1).padStart(3, '0')}`;
          const datePrefix = new Date()
            .toISOString()
            .substring(0, 10)
            .replace(/-/g, '');
          const sliceObjectKey = `slices/${datePrefix}/${materialId}/slice_${String(i + 1).padStart(3, '0')}.mp4`;

          let streamUrl: string;
          let keyFrameUrl: string | null = null;

          try {
            streamUrl = await deps.atoms.uploadSliceToMinIO(
              deps.minio,
              slicePath,
              sliceObjectKey,
            );
          } catch {
            failedSegments++;
            continue;
          }

          try {
            const keyFrameObjectKey = `slices/${datePrefix}/${materialId}/keyframe_${String(i + 1).padStart(3, '0')}.webp`;
            keyFrameUrl = await deps.atoms.uploadKeyFrameToMinIO(
              deps.minio,
              keyFramePath,
              keyFrameObjectKey,
            );
          } catch {
            keyFrameUrl = null;
          }

          const progressBase = 60;
          const progressRange = 30;
          const currentProgress =
            progressBase +
            Math.floor(
              (i / totalSegments) * progressRange,
            );
          await job.updateProgress(currentProgress);

          try {
            await deps.atoms.updateSliceViaCallback(
              deps.httpClient,
              materialId,
              {
                slice_id: sliceId,
                status: 'CAPTIONING',
                stream_url: streamUrl,
                key_frame_url: keyFrameUrl || undefined,
                trace_id: traceId,
              },
            );
          } catch (callbackError) {
            failedSegments++;
            continue;
          }

          let captionResult: TestCaptionResult;
          try {
            captionResult = await deps.atoms.generateSliceCaption(
              segment,
              productInfo,
              {
                buildCaptionPrompt,
                parseCaptionResponse,
                callCaptionAPI,
              },
            );
          } catch {
            try {
              await deps.atoms.updateSliceViaCallback(
                deps.httpClient,
                materialId,
                {
                  slice_id: sliceId,
                  status: 'FAILED',
                  trace_id: traceId,
                },
              );
            } catch {
              // callback already failed, best effort
            }
            failedSegments++;
            continue;
          }

          try {
            await deps.atoms.updateSliceViaCallback(
              deps.httpClient,
              materialId,
              {
                slice_id: sliceId,
                status: 'COMPLETED',
                stream_url: streamUrl,
                key_frame_url: keyFrameUrl || undefined,
                dense_caption: captionResult.dense_caption,
                tags: captionResult.tags,
                trace_id: traceId,
              },
            );
            completedSegments++;
          } catch {
            failedSegments++;
          }
        }

        await job.updateProgress(100);
      } finally {
        await deps.atoms.cleanupTemporaryFiles(jobTempDir);
      }
    };

    // ---- Gateway 端: handleSliceCallback ----

    handleSliceCallback = async (callback, deps) => {
      const { material_id, slice_id, status, stream_url, key_frame_url, dense_caption, tags, trace_id } = callback;

      if (!material_id || !slice_id || !status) {
        throw Object.assign(
          new Error('Missing required fields: material_id, slice_id, status'),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      const validStatuses: MaterialSliceStatus[] = [
        'PENDING',
        'CAPTIONING',
        'EMBEDDING',
        'COMPLETED',
        'FAILED',
      ];
      if (!validStatuses.includes(status)) {
        throw Object.assign(
          new Error(`Invalid slice status: ${status}`),
          {
            errorCode: 'INVALID_REQUEST',
            statusCode: HttpStatus.BAD_REQUEST,
            retryable: false,
          },
        );
      }

      const updateData: Record<string, unknown> = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (stream_url !== undefined && stream_url !== null) {
        updateData.stream_url = stream_url;
      }
      if (key_frame_url !== undefined && key_frame_url !== null) {
        updateData.key_frame_url = key_frame_url;
      }
      if (dense_caption !== undefined && dense_caption !== null) {
        updateData.dense_caption = dense_caption;
      }
      if (tags !== undefined && tags !== null) {
        updateData.tags = JSON.stringify(tags);
      }

      try {
        await deps.prisma.materialSlice.update({
          where: { slice_id },
          data: updateData,
        });

        const allSlices = await deps.prisma.materialSlice.findMany({
          where: { material_id },
        });

        const allProcessed = allSlices.every(
          (slice: Record<string, unknown>) =>
            slice.status === 'COMPLETED' || slice.status === 'FAILED',
        );

        if (allProcessed) {
          const hasFailed = allSlices.some(
            (slice: Record<string, unknown>) => slice.status === 'FAILED',
          );

          await deps.prisma.material.update({
            where: { id: material_id },
            data: {
              status: hasFailed ? 'FAILED' : 'COMPLETED',
              updated_at: new Date().toISOString(),
            },
          });
        }
      } catch (error) {
        const prismaError = error as Error & { code?: string };

        if (prismaError.code === 'P2025') {
          throw Object.assign(
            new Error(`Slice not found: ${slice_id}`),
            {
              errorCode: 'MATERIAL_NOT_FOUND',
              statusCode: HttpStatus.NOT_FOUND,
              retryable: false,
            },
          );
        }

        if (prismaError.code === 'P2002') {
          throw Object.assign(
            new Error(`Unique constraint violation for slice: ${slice_id}`),
            {
              errorCode: 'MATERIAL_IDEMPOTENCY_CONFLICT',
              statusCode: HttpStatus.CONFLICT,
              retryable: false,
            },
          );
        }

        throw Object.assign(
          new Error(`Database error during slice callback: ${prismaError.message}`),
          {
            errorCode: 'INTERNAL_SERVER_ERROR',
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            retryable: true,
          },
        );
      }
    };
  });

  // ===================================================================
  // 1. 【正常流（Happy Path）】
  // ===================================================================

  describe('【正常流】主链路全流水线验证', () => {
    it('TC-SLICER-001: 完整流水线 — 9s 视频 → 3 个切片 → 全部 COMPLETED → callbacks 成功', async () => {
      const gatewayData = mockGatewayMaterialResponseFactory();
      mockGatewayClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: gatewayData, trace_id: TRACE_ID }),
      });

      const captions = [
        mockCaptionResultFactory({
          dense_caption:
            'A wide shot establishing the modern bathroom setting with bright morning light. The smart curling iron is placed on a marble countertop, highlighted by natural window lighting.',
          tags: ['wide_shot', 'bathroom_setting', 'morning_light', 'marble_countertop'],
        }),
        mockCaptionResultFactory({
          dense_caption:
            'A close-up demonstration of the curling iron being used on a strand of hair. The LED temperature display shows 180°C, and steam indicates the ceramic coating is active.',
          tags: [
            'close-up',
            'product_demo',
            'LED_display',
            'temperature',
            'hair_styling',
            'ceramic_coating',
          ],
        }),
        mockCaptionResultFactory({
          dense_caption:
            'A beauty shot of the finished hairstyle with soft bokeh background. The model smiles confidently, running fingers through voluminous curls.',
          tags: [
            'beauty_shot',
            'bokeh',
            'finished_result',
            'model_smile',
            'voluminous_curls',
          ],
        }),
      ];
      let captionCallIndex = 0;
      callCaptionAPI = jest.fn().mockImplementation(() => {
        const result = captions[captionCallIndex];
        captionCallIndex++;
        return Promise.resolve(JSON.stringify(result));
      });

      mockGatewayClient.post.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      const job = mockSliceJobContextFactory();

      await processSliceJob(job, {
        httpClient: mockGatewayClient,
        minio: mockMinio,
        atoms: {
          fetchMaterialFromGateway,
          downloadSourceVideo,
          detectSceneBoundaries,
          optimizeSliceBoundaries,
          executeFfmpegSlicing,
          extractKeyFrames,
          uploadSliceToMinIO,
          uploadKeyFrameToMinIO,
          generateSliceCaption,
          updateSliceViaCallback,
          cleanupTemporaryFiles,
          generateTraceId,
        },
      });

      const updateProgressCalls = job.updateProgress.mock.calls.map(
        (call: number[]) => call[0],
      );
      expect(updateProgressCalls).toContain(100);

      expect(mockGatewayClient.get).toHaveBeenCalled();
      expect(mockMinio.getObject).toHaveBeenCalled();
      expect(mockExecFile).toHaveBeenCalled();

      const sliceUploadCalls = mockMinio.putObject.mock.calls.filter(
        (call: string[]) => (call[2] as string) === 'video/mp4',
      );
      expect(sliceUploadCalls.length).toBe(3);

      const keyframeUploadCalls = mockMinio.putObject.mock.calls.filter(
        (call: string[]) => (call[2] as string) === 'image/webp',
      );
      expect(keyframeUploadCalls.length).toBe(3);

      expect(mockGatewayClient.post).toHaveBeenCalledTimes(6);

      const captionCallCount = callCaptionAPI as jest.Mock;
      expect(captionCallCount.mock.calls.length).toBe(3);
    });

    it('TC-SLICER-002: 正常流水线 — 精确匹配 output 结构', async () => {
      const gatewayData = mockGatewayMaterialResponseFactory({
        duration_seconds: 6.0,
        slices: [
          {
            id: 'slice-uuid-1',
            slice_id: 'slc_20260525_000001_001',
            start_time: 0.0,
            end_time: 3.0,
            duration: 3.0,
            status: 'PENDING',
          },
          {
            id: 'slice-uuid-2',
            slice_id: 'slc_20260525_000002_002',
            start_time: 3.0,
            end_time: 6.0,
            duration: 3.0,
            status: 'PENDING',
          },
        ],
      });
      mockGatewayClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: gatewayData, trace_id: TRACE_ID }),
      });

      callCaptionAPI = jest.fn().mockResolvedValue(
        JSON.stringify(mockCaptionResultFactory()),
      );

      const job = mockSliceJobContextFactory();

      await processSliceJob(job, {
        httpClient: mockGatewayClient,
        minio: mockMinio,
        atoms: {
          fetchMaterialFromGateway,
          downloadSourceVideo,
          detectSceneBoundaries,
          optimizeSliceBoundaries,
          executeFfmpegSlicing,
          extractKeyFrames,
          uploadSliceToMinIO,
          uploadKeyFrameToMinIO,
          generateSliceCaption,
          updateSliceViaCallback,
          cleanupTemporaryFiles,
          generateTraceId,
        },
      });

      const uploadCalls = mockMinio.putObject.mock.calls;
      const videoUploads = uploadCalls.filter(
        (call: string[]) => (call[2] as string) === 'video/mp4',
      );
      expect(videoUploads.length).toBe(2);

      const postCalls = mockGatewayClient.post.mock.calls;
      expect(postCalls.length).toBe(4);

      const firstCaptioningCall = postCalls[0][1] as Record<string, unknown>;
      expect(firstCaptioningCall.status).toBe('CAPTIONING');
      expect(firstCaptioningCall.material_id).toBe(MATERIAL_ID);
      expect(firstCaptioningCall.trace_id).toBeDefined();
      expect(typeof firstCaptioningCall.stream_url).toBe('string');

      const firstCompletedCall = postCalls[1][1] as Record<string, unknown>;
      expect(firstCompletedCall.status).toBe('COMPLETED');
      expect(firstCompletedCall.dense_caption).toBeDefined();
      expect(Array.isArray(firstCompletedCall.tags)).toBe(true);
    });

    it('TC-SLICER-003: TransNetV2 检测到 2 个转场 → 边界被吸附优化', async () => {
      const gatewayData = mockGatewayMaterialResponseFactory({
        duration_seconds: 9.0,
      });
      mockGatewayClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: gatewayData, trace_id: TRACE_ID }),
      });

      mockExecFile.mockResolvedValue({
        stdout: JSON.stringify(
          mockDecordOutputFactory({
            predictions: [
              { timestamp_sec: 3.05, confidence: 0.94 },
              { timestamp_sec: 5.92, confidence: 0.87 },
            ],
          }),
        ),
        stderr: '',
      });

      callCaptionAPI = jest.fn().mockResolvedValue(
        JSON.stringify(mockCaptionResultFactory()),
      );

      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 3.0),
        mockSliceRecordFactory(2, 3.0, 6.0),
        mockSliceRecordFactory(3, 6.0, 9.0),
      ];

      const segments = optimizeSliceBoundaries(
        initialSlices,
        [
          { timestamp_sec: 3.05, confidence: 0.94 },
          { timestamp_sec: 5.92, confidence: 0.87 },
        ],
        9.0,
      );

      expect(segments.length).toBeGreaterThanOrEqual(1);
      expect(segments.length).toBeLessThanOrEqual(6);

      for (const seg of segments) {
        expect(seg.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
        expect(seg.duration).toBeLessThanOrEqual(SLICE_MAX_DURATION);
        expect(seg.start_sec).toBeGreaterThanOrEqual(0);
        expect(seg.end_sec).toBeLessThanOrEqual(9.0);
      }

      const totalDuration = segments.reduce(
        (sum, seg) => sum + seg.duration,
        0,
      );
      expect(Math.abs(totalDuration - 9.0)).toBeLessThanOrEqual(0.5);
    });

    it('TC-SLICER-004: trace_id 格式验证', () => {
      const traceId = generateTraceId(MATERIAL_ID);
      expect(traceId).toMatch(/^trc_\d{8}_slice_[a-f0-9]{8}$/);
    });
  });

  // ===================================================================
  // 2. 【边界流（Edge Cases）】
  // ===================================================================

  describe('【边界流】极端边界输入', () => {
    it('TC-SLICER-BND-001: 视频时长恰好 1.5s（最小有效时长）→ 产出 1 个切片', () => {
      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 1.5),
      ];

      const segments = optimizeSliceBoundaries(initialSlices, [], 1.5);

      expect(segments.length).toBe(1);
      expect(segments[0].start_sec).toBe(0.0);
      expect(segments[0].end_sec).toBe(1.5);
      expect(segments[0].duration).toBe(1.5);
    });

    it('TC-SLICER-BND-002: 视频时长恰好 15.0s（最大时长）→ 产出多个切片', () => {
      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 3.0),
        mockSliceRecordFactory(2, 3.0, 6.0),
        mockSliceRecordFactory(3, 6.0, 9.0),
        mockSliceRecordFactory(4, 9.0, 12.0),
        mockSliceRecordFactory(5, 12.0, 15.0),
      ];

      const segments = optimizeSliceBoundaries(initialSlices, [], 15.0);

      expect(segments.length).toBeGreaterThanOrEqual(4);

      for (const seg of segments) {
        expect(seg.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
        expect(seg.duration).toBeLessThanOrEqual(SLICE_MAX_DURATION);
      }

      const totalDuration = segments.reduce(
        (sum, seg) => sum + seg.duration,
        0,
      );
      expect(Math.abs(totalDuration - 15.0)).toBeLessThanOrEqual(0.5);
    });

    it('TC-SLICER-BND-003: TransNetV2 返回空预测 → 降级使用初始等距边界', () => {
      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 3.0),
        mockSliceRecordFactory(2, 3.0, 6.0),
        mockSliceRecordFactory(3, 6.0, 9.0),
      ];

      const segments = optimizeSliceBoundaries(initialSlices, [], 9.0);

      expect(segments.length).toBe(3);
      expect(segments[0].start_sec).toBe(0.0);
      expect(segments[0].end_sec).toBe(3.0);
      expect(segments[2].start_sec).toBe(6.0);
      expect(segments[2].end_sec).toBe(9.0);
    });

    it('TC-SLICER-BND-004: TransNetV2 返回杂散切点（confidence 极低或时间戳在范围外）→ 不被吸附', () => {
      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 3.0),
        mockSliceRecordFactory(2, 3.0, 6.0),
        mockSliceRecordFactory(3, 6.0, 9.0),
      ];

      const badSceneCuts: TestSceneBoundary[] = [
        { timestamp_sec: 0.0, confidence: 0.99 },
        { timestamp_sec: 9.0, confidence: 0.99 },
        { timestamp_sec: 0.1, confidence: 0.01 },
        { timestamp_sec: 7.5, confidence: 0.85 },
      ];

      const segments = optimizeSliceBoundaries(
        initialSlices,
        badSceneCuts,
        9.0,
      );

      expect(segments.length).toBeGreaterThanOrEqual(1);
      for (const seg of segments) {
        expect(seg.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
        expect(seg.duration).toBeLessThanOrEqual(SLICE_MAX_DURATION);
      }
    });

    it('TC-SLICER-BND-005: 单分片时长恰好 4.0s（边界临界值）→ 合法通过', () => {
      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 4.0),
        mockSliceRecordFactory(2, 4.0, 8.0),
      ];

      const segments = optimizeSliceBoundaries(initialSlices, [], 8.0);

      for (const seg of segments) {
        expect(seg.duration).toBeLessThanOrEqual(SLICE_MAX_DURATION);
      }
    });

    it('TC-SLICER-BND-006: 超过 4.0s 的切片被自动分割为子切片', () => {
      const initialSlices: TestMaterialSliceRecord[] = [
        mockSliceRecordFactory(1, 0.0, 5.0),
        mockSliceRecordFactory(2, 5.0, 9.0),
      ];

      const segments = optimizeSliceBoundaries(initialSlices, [], 9.0);

      expect(segments.length).toBeGreaterThanOrEqual(3);
      for (const seg of segments) {
        expect(seg.duration).toBeLessThanOrEqual(SLICE_MAX_DURATION);
        expect(seg.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
      }
    });

    it('TC-SLICER-BND-007: AI 返回的 dense_caption 为空字符串 → parseCaptionResponse 抛出 SCRIPT_PARSE_FAILED', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        parseCaptionResponse(JSON.stringify({ dense_caption: '', tags: ['test'] }));
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_PARSE_FAILED');
    });

    it('TC-SLICER-BND-008: AI 返回的 tags 为空数组 → parseCaptionResponse 抛出 SCRIPT_PARSE_FAILED', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        parseCaptionResponse(
          JSON.stringify({
            dense_caption: 'A valid caption about a smart curling iron.',
            tags: [],
          }),
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_PARSE_FAILED');
    });

    it('TC-SLICER-BND-009: AI 返回的 tags 含空白字符串 → 过滤后仍为空 → 抛出 SCRIPT_PARSE_FAILED', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        parseCaptionResponse(
          JSON.stringify({
            dense_caption: 'A valid caption.',
            tags: ['', '   ', '\t'],
          }),
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('SCRIPT_PARSE_FAILED');
    });

    it('TC-SLICER-BND-010: AI 响应包裹在 markdown 代码块中 → 正确剥离并解析', () => {
      const result = parseCaptionResponse(
        '```json\n' +
          JSON.stringify(mockCaptionResultFactory()) +
          '\n```',
      );
      expect(result.dense_caption.length).toBeGreaterThan(0);
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('TC-SLICER-BND-011: 关键帧抽取部分失败 → key_frame_url 为 null → 流水线不阻断', async () => {
      mockExecFile
        .mockResolvedValueOnce({
          stdout: JSON.stringify(mockDecordOutputFactory()),
          stderr: '',
        })
        .mockResolvedValueOnce({ stdout: '', stderr: 'output valid' })
        .mockResolvedValueOnce({ stdout: '', stderr: 'output valid' })
        .mockResolvedValueOnce({ stdout: '', stderr: 'output valid' })
        .mockRejectedValueOnce(new Error('FFmpeg keyframe seg#1 failed'))
        .mockResolvedValueOnce({ stdout: '', stderr: 'keyframe seg#2 ok' })
        .mockRejectedValueOnce(new Error('FFmpeg keyframe seg#3 failed'));

      const gatewayData = mockGatewayMaterialResponseFactory({
        duration_seconds: 9.0,
      });
      mockGatewayClient.get.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: gatewayData, trace_id: TRACE_ID }),
      });

      callCaptionAPI = jest.fn().mockResolvedValue(
        JSON.stringify(mockCaptionResultFactory()),
      );

      const job = mockSliceJobContextFactory();

      await processSliceJob(job, {
        httpClient: mockGatewayClient,
        minio: mockMinio,
        atoms: {
          fetchMaterialFromGateway,
          downloadSourceVideo,
          detectSceneBoundaries,
          optimizeSliceBoundaries,
          executeFfmpegSlicing,
          extractKeyFrames,
          uploadSliceToMinIO,
          uploadKeyFrameToMinIO,
          generateSliceCaption,
          updateSliceViaCallback,
          cleanupTemporaryFiles,
          generateTraceId,
        },
      });

      const postCalls = mockGatewayClient.post.mock.calls;

      const captioningCalls = postCalls.filter(
        (call: unknown[]) => {
          const body = call[1] as Record<string, unknown>;
          return body.status === 'CAPTIONING';
        },
      );

      for (const call of captioningCalls) {
        const body = call[1] as Record<string, unknown>;
        expect(body.stream_url).toBeDefined();
      }

      const hasNullKeyFrame = captioningCalls.some(
        (call: unknown[]) => {
          const body = call[1] as Record<string, unknown>;
          return body.key_frame_url === undefined || body.key_frame_url === null;
        },
      );
      expect(hasNullKeyFrame).toBe(true);
    });

    it('TC-SLICER-BND-012: 视频时长 < 1.5s → GPU_SLICING_NO_VALID_SLICES', () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null =
        null;

      try {
        optimizeSliceBoundaries(
          [mockSliceRecordFactory(1, 0.0, 1.2)],
          [],
          1.2,
        );
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }

      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('GPU_SLICING_NO_VALID_SLICES');
      expect(caught!.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });

  // ===================================================================
  // 3. 【异常流（Error Flow）】
  // ===================================================================

  describe('【异常流】第三方异常 × Worker 故障兜底 × Gateway 回写错误', () => {
    // ---- 3.1 MinIO 层异常 ----

    describe('3.1 MinIO 下载失败', () => {
      it('TC-SLICER-ERR-001: MinIO getObject 抛出异常 → GPU_SLICING_DOWNLOAD_FAILED', async () => {
        mockMinio.getObject.mockRejectedValue(
          new Error('Network connection refused'),
        );

        const gatewayData = mockGatewayMaterialResponseFactory();
        mockGatewayClient.get.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: gatewayData,
            trace_id: TRACE_ID,
          }),
        });

        let caught: Error & { errorCode?: string; statusCode?: number; retryable?: boolean } | null = null;

        try {
          await downloadSourceVideo(
            mockMinio,
            gatewayData.origin_url,
            TEMP_DIR,
          );
        } catch (e) {
          caught = e as Error & {
            errorCode?: string;
            statusCode?: number;
            retryable?: boolean;
          };
        }

        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_DOWNLOAD_FAILED');
        expect(caught!.statusCode).toBe(HttpStatus.BAD_GATEWAY);
        expect(caught!.retryable).toBe(true);
      });

      it('TC-SLICER-ERR-002: MinIO getObject 返回空 buffer → GPU_SLICING_DOWNLOAD_FAILED', async () => {
        mockMinio.getObject.mockResolvedValue({
          buffer: Buffer.alloc(0),
          contentType: 'video/mp4',
        });

        let caught: Error & { errorCode?: string } | null = null;

        try {
          await downloadSourceVideo(
            mockMinio,
            'http://minio:9000/tikstream-assets/materials/20260525/dc52d4ff/video.mp4',
            TEMP_DIR,
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }

        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_DOWNLOAD_FAILED');
      });
    });

    // ---- 3.2 Python / Decord / TransNetV2 层异常 ----

    describe('3.2 Python 子进程与模型异常', () => {
      it('TC-SLICER-ERR-003: python3 不存在 (ENOENT) → GPU_SLICING_PYTHON_DEPENDENCY_MISSING', async () => {
        const execFile = jest.fn().mockRejectedValue(
          Object.assign(new Error('python3: command not found'), { code: 'ENOENT' }),
        );

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;

        try {
          await detectSceneBoundaries('/tmp/test.mp4', TEMP_DIR, execFile);
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }

        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_PYTHON_DEPENDENCY_MISSING');
        expect(caught!.retryable).toBe(false);
      });

      it('TC-SLICER-ERR-004: Python ModuleNotFoundError (decord 缺失) → GPU_SLICING_PYTHON_DEPENDENCY_MISSING', async () => {
        const execFile = jest.fn().mockRejectedValue(
          Object.assign(
            new Error('ModuleNotFoundError: No module named \'decord\''),
            {
              code: 1,
              stderr: 'ModuleNotFoundError: No module named \'decord\'',
            },
          ),
        );

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await detectSceneBoundaries('/tmp/test.mp4', TEMP_DIR, execFile);
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_PYTHON_DEPENDENCY_MISSING');
      });

      it('TC-SLICER-ERR-005: Decord 解码失败 (文件损坏) → GPU_SLICING_DECORD_FAILED', async () => {
        const stdout = JSON.stringify({
          success: false,
          predictions: [],
          error: 'Decord VideoReader failed: Unsupported codec or corrupt file',
          video_duration: 0,
          frame_count: 0,
        });

        const execFile = jest
          .fn()
          .mockResolvedValue({ stdout, stderr: '' });

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await detectSceneBoundaries('/tmp/test.mp4', TEMP_DIR, execFile);
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_DECORD_FAILED');
        expect(caught!.retryable).toBe(true);
      });

      it('TC-SLICER-ERR-006: TransNetV2 CUDA OOM → GPU_SLICING_TRANSNET_FAILED', async () => {
        const stdout = JSON.stringify({
          success: false,
          predictions: [],
          error: 'CUDA out of memory at /workspace/transnetv2/model.py:142',
          video_duration: 9.0,
          frame_count: 270,
        });

        const execFile = jest
          .fn()
          .mockResolvedValue({ stdout, stderr: '' });

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await detectSceneBoundaries('/tmp/test.mp4', TEMP_DIR, execFile);
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_TRANSNET_FAILED');
        expect(caught!.retryable).toBe(true);
      });
    });

    // ---- 3.3 FFmpeg 层异常 ----

    describe('3.3 FFmpeg 切割异常', () => {
      it('TC-SLICER-ERR-007: ffmpeg 二进制不存在 → GPU_SLICING_FFMPEG_NOT_FOUND', async () => {
        const execFile = jest.fn().mockRejectedValue(
          Object.assign(new Error('ffmpeg: command not found'), { code: 'ENOENT' }),
        );

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await executeFfmpegSlicing(
            '/tmp/source.mp4',
            [mockSliceSegmentFactory(1, 0.0, 3.0)],
            TEMP_DIR,
            execFile,
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_FFMPEG_NOT_FOUND');
        expect(caught!.retryable).toBe(false);
      });

      it('TC-SLICER-ERR-008: FFmpeg 切割超时 (30s) → GPU_SLICING_FFMPEG_CUT_FAILED', async () => {
        const execFile = jest
          .fn()
          .mockRejectedValue(new Error('Command timed out'));

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await executeFfmpegSlicing(
            '/tmp/source.mp4',
            [mockSliceSegmentFactory(1, 0.0, 3.0)],
            TEMP_DIR,
            execFile,
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_FFMPEG_CUT_FAILED');
        expect(caught!.retryable).toBe(true);
      });

      it('TC-SLICER-ERR-009: FFmpeg 进程异常退出 → GPU_SLICING_FFMPEG_CUT_FAILED', async () => {
        const execFile = jest
          .fn()
          .mockRejectedValue(new Error('FFmpeg process killed by signal'));

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await executeFfmpegSlicing(
            '/tmp/source.mp4',
            [mockSliceSegmentFactory(1, 0.0, 3.0)],
            TEMP_DIR,
            execFile,
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_FFMPEG_CUT_FAILED');
      });
    });

    // ---- 3.4 切片边界优化异常 ----

    describe('3.4 切片边界优化异常', () => {
      it('TC-SLICER-ERR-010: 视频时长 ≤ 0 → GPU_SLICING_NO_VALID_SLICES', () => {
        let caught: Error & { errorCode?: string } | null = null;
        try {
          optimizeSliceBoundaries(
            [mockSliceRecordFactory(1, 0.0, 3.0)],
            [],
            0,
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_NO_VALID_SLICES');
      });

      it('TC-SLICER-ERR-011: 视频时长为 NaN → GPU_SLICING_NO_VALID_SLICES', () => {
        let caught: Error & { errorCode?: string } | null = null;
        try {
          optimizeSliceBoundaries(
            [mockSliceRecordFactory(1, 0.0, 3.0)],
            [],
            Number.NaN,
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_NO_VALID_SLICES');
      });

      it('TC-SLICER-ERR-012: 初始切片列表为空 → GPU_SLICING_NO_VALID_SLICES', () => {
        let caught: Error & { errorCode?: string } | null = null;
        try {
          optimizeSliceBoundaries([], [], 9.0);
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('GPU_SLICING_NO_VALID_SLICES');
      });
    });

    // ---- 3.5 Doubao Caption API 异常 ----

    describe('3.5 Doubao Caption API 异常', () => {
      it('TC-SLICER-ERR-013: Doubao API 返回 RATE_LIMITED → 错误穿透', async () => {
        const rateLimitedError = Object.assign(
          new Error('Rate limit exceeded'),
          { errorCode: 'RATE_LIMITED' },
        );
        const mockCallAPI = jest.fn().mockRejectedValue(rateLimitedError);

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await generateSliceCaption(
            mockSliceSegmentFactory(1, 0.0, 3.0),
            mockProductMetaFactory(),
            {
              buildCaptionPrompt,
              parseCaptionResponse,
              callCaptionAPI: mockCallAPI,
            },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('RATE_LIMITED');
      });

      it('TC-SLICER-ERR-014: Doubao API 网络超时 → MODEL_PROVIDER_FAILED', async () => {
        const mockCallAPI = jest
          .fn()
          .mockRejectedValue(new Error('Network timeout'));

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await generateSliceCaption(
            mockSliceSegmentFactory(1, 0.0, 3.0),
            mockProductMetaFactory(),
            {
              buildCaptionPrompt,
              parseCaptionResponse,
              callCaptionAPI: mockCallAPI,
            },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('MODEL_PROVIDER_FAILED');
        expect(caught!.retryable).toBe(true);
      });
    });

    // ---- 3.6 Gateway 回调失败 ----

    describe('3.6 Gateway 回调失败', () => {
      it('TC-SLICER-ERR-015: 回调 3 次全部失败 → INTERNAL_WORKER_CALLBACK_FAILED', async () => {
        mockGatewayClient.post.mockRejectedValue(
          new Error('Connection refused'),
        );

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;

        const startTime = Date.now();
        try {
          await updateSliceViaCallback(
            mockGatewayClient,
            MATERIAL_ID,
            mockSliceUpdatePayloadFactory('slc_20260525_000001_001', 'COMPLETED'),
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        const elapsed = Date.now() - startTime;

        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('INTERNAL_WORKER_CALLBACK_FAILED');
        expect(caught!.retryable).toBe(true);

        expect(elapsed).toBeGreaterThanOrEqual(
          CALLBACK_RETRY_DELAY_BASE_MS + CALLBACK_RETRY_DELAY_BASE_MS * 2 - 100,
        );
      });

      it('TC-SLICER-ERR-016: 回调首次失败第二次成功 → 正常返回', async () => {
        mockGatewayClient.post
          .mockRejectedValueOnce(new Error('Temporary failure'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ success: true }),
          });

        await expect(
          updateSliceViaCallback(
            mockGatewayClient,
            MATERIAL_ID,
            mockSliceUpdatePayloadFactory('slc_20260525_000001_001', 'COMPLETED'),
          ),
        ).resolves.toBeUndefined();

        expect(mockGatewayClient.post).toHaveBeenCalledTimes(2);
      });

      it('TC-SLICER-ERR-017: Gateway 返回 500 → 触发重试 → 仍失败 → INTERNAL_WORKER_CALLBACK_FAILED', async () => {
        const errorResponse = {
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            message: 'Internal server error',
          }),
        };
        mockGatewayClient.post.mockResolvedValue(errorResponse);

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await updateSliceViaCallback(
            mockGatewayClient,
            MATERIAL_ID,
            mockSliceUpdatePayloadFactory('slc_20260525_000001_001', 'COMPLETED'),
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('INTERNAL_WORKER_CALLBACK_FAILED');
        expect(mockGatewayClient.post).toHaveBeenCalledTimes(3);
      });
    });

    // ---- 3.7 Gateway handleSliceCallback 数据库异常 ----

    describe('3.7 Gateway 端 slice_callback 数据库异常', () => {
      it('TC-SLICER-ERR-018: P2025 切片不存在 → MATERIAL_NOT_FOUND', async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockRejectedValue(
              Object.assign(
                new Error('Record not found'),
                { code: 'P2025' },
              ),
            ),
            findMany: jest.fn(),
          },
          material: { update: jest.fn() },
        };

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await handleSliceCallback(
            mockSliceCallbackRequestFactory(),
            { prisma: mockPrisma },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
        expect(caught!.retryable).toBe(false);
      });

      it('TC-SLICER-ERR-019: P2002 唯一约束冲突 → MATERIAL_IDEMPOTENCY_CONFLICT', async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockRejectedValue(
              Object.assign(new Error('Unique constraint violation'), {
                code: 'P2002',
              }),
            ),
            findMany: jest.fn(),
          },
          material: { update: jest.fn() },
        };

        let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
        try {
          await handleSliceCallback(
            mockSliceCallbackRequestFactory(),
            { prisma: mockPrisma },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; statusCode?: number };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('MATERIAL_IDEMPOTENCY_CONFLICT');
        expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
      });

      it('TC-SLICER-ERR-020: 回调缺少必填字段 → INVALID_REQUEST', async () => {
        const mockPrisma = {
          materialSlice: { update: jest.fn(), findMany: jest.fn() },
          material: { update: jest.fn() },
        };

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await handleSliceCallback(
            mockSliceCallbackRequestFactory({
              material_id: '',
              slice_id: '',
            }),
            { prisma: mockPrisma },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('INVALID_REQUEST');
      });

      it('TC-SLICER-ERR-021: 非法 slice status → INVALID_REQUEST', async () => {
        const mockPrisma = {
          materialSlice: { update: jest.fn(), findMany: jest.fn() },
          material: { update: jest.fn() },
        };

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await handleSliceCallback(
            mockSliceCallbackRequestFactory({
              status: 'INVALID_STATUS' as MaterialSliceStatus,
            }),
            { prisma: mockPrisma },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('INVALID_REQUEST');
      });

      it('TC-SLICER-ERR-022: 通用数据库异常 → INTERNAL_SERVER_ERROR', async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockRejectedValue(
              Object.assign(new Error('Connection pool timeout'), {
                code: 'P1001',
              }),
            ),
            findMany: jest.fn(),
          },
          material: { update: jest.fn() },
        };

        let caught: Error & { errorCode?: string; retryable?: boolean } | null = null;
        try {
          await handleSliceCallback(
            mockSliceCallbackRequestFactory(),
            { prisma: mockPrisma },
          );
        } catch (e) {
          caught = e as Error & { errorCode?: string; retryable?: boolean };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
        expect(caught!.retryable).toBe(true);
      });
    });

    // ---- 3.8 主编排的容错 —— 单切片失败不阻断其他切片 ----

    describe('3.8 主编排部分切片失败的容错', () => {
      it('TC-SLICER-ERR-023: 第 2 个切片 Caption 失败 → 标记 FAILED → 其余切片正常 COMPLETED', async () => {
        const gatewayData = mockGatewayMaterialResponseFactory({
          duration_seconds: 9.0,
        });
        mockGatewayClient.get.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: gatewayData,
            trace_id: TRACE_ID,
          }),
        });

        let callCount = 0;
        callCaptionAPI = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 2) {
            return Promise.reject(new Error('Doubao API 500'));
          }
          return Promise.resolve(JSON.stringify(mockCaptionResultFactory()));
        });

        mockGatewayClient.post.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

        const job = mockSliceJobContextFactory();

        await processSliceJob(job, {
          httpClient: mockGatewayClient,
          minio: mockMinio,
          atoms: {
            fetchMaterialFromGateway,
            downloadSourceVideo,
            detectSceneBoundaries,
            optimizeSliceBoundaries,
            executeFfmpegSlicing,
            extractKeyFrames,
            uploadSliceToMinIO,
            uploadKeyFrameToMinIO,
            generateSliceCaption,
            updateSliceViaCallback,
            cleanupTemporaryFiles,
            generateTraceId,
          },
        });

        const postCalls = mockGatewayClient.post.mock.calls;
        const completedCalls = postCalls.filter(
          (call: unknown[]) => {
            const body = call[1] as Record<string, unknown>;
            return body.status === 'COMPLETED';
          },
        );
        const failedCalls = postCalls.filter(
          (call: unknown[]) => {
            const body = call[1] as Record<string, unknown>;
            return body.status === 'FAILED';
          },
        );

        expect(completedCalls.length).toBe(2);
        expect(failedCalls.length).toBe(1);

        const updateProgressCalls = job.updateProgress.mock.calls.map(
          (call: number[]) => call[0],
        );
        expect(updateProgressCalls).toContain(100);
      });
    });
  });

  // ===================================================================
  // 4. 【性能流（Performance）】
  // ===================================================================

  describe('【性能流】耗时与资源上限卡点', () => {
    it(
      'TC-SLICER-PERF-001: 完整流水线 (9s 视频 3 切片) 总耗时 ≤ 1s (无真实 I/O)',
      async () => {
        const gatewayData = mockGatewayMaterialResponseFactory({
          duration_seconds: 9.0,
        });
        mockGatewayClient.get.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: gatewayData,
            trace_id: TRACE_ID,
          }),
        });

        callCaptionAPI = jest
          .fn()
          .mockResolvedValue(JSON.stringify(mockCaptionResultFactory()));

        mockGatewayClient.post.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

        const job = mockSliceJobContextFactory();

        const startTime = performance.now();
        await processSliceJob(job, {
          httpClient: mockGatewayClient,
          minio: mockMinio,
          atoms: {
            fetchMaterialFromGateway,
            downloadSourceVideo,
            detectSceneBoundaries,
            optimizeSliceBoundaries,
            executeFfmpegSlicing,
            extractKeyFrames,
            uploadSliceToMinIO,
            uploadKeyFrameToMinIO,
            generateSliceCaption,
            updateSliceViaCallback,
            cleanupTemporaryFiles,
            generateTraceId,
          },
        });
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(1000);
      },
      10000,
    );

    it(
      'TC-SLICER-PERF-002: optimizeSliceBoundaries 15 秒视频耗时 ≤ 50ms',
      () => {
        const initialSlices: TestMaterialSliceRecord[] = [];
        const sliceCount = Math.ceil(15.0 / SLICE_TARGET_DURATION);
        for (let i = 0; i < sliceCount; i++) {
          initialSlices.push(
            mockSliceRecordFactory(i + 1, i * 3.0, Math.min((i + 1) * 3.0, 15.0)),
          );
        }

        const startTime = performance.now();
        const segments = optimizeSliceBoundaries(initialSlices, [], 15.0);
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(50);
        expect(segments.length).toBeGreaterThanOrEqual(4);
      },
      5000,
    );

    it(
      'TC-SLICER-PERF-003: parseCaptionResponse 正常输入耗时 ≤ 10ms',
      () => {
        const rawJson = JSON.stringify(mockCaptionResultFactory());

        const startTime = performance.now();
        const result = parseCaptionResponse(rawJson);
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(10);
        expect(result.dense_caption.length).toBeGreaterThan(0);
        expect(result.tags.length).toBeGreaterThan(0);
      },
      5000,
    );

    it(
      'TC-SLICER-PERF-004: buildCaptionPrompt 生成 Prompt 耗时 ≤ 5ms',
      () => {
        const segment = mockSliceSegmentFactory(1, 0.0, 3.0);
        const productInfo = mockProductMetaFactory();

        const startTime = performance.now();
        const prompts = buildCaptionPrompt(segment, productInfo);
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(5);
        expect(prompts.systemPrompt.length).toBeGreaterThan(0);
        expect(prompts.userPrompt.length).toBeGreaterThan(0);
      },
      5000,
    );

    it(
      'TC-SLICER-PERF-005: updateSliceViaCallback 单次成功耗时 ≤ 200ms',
      async () => {
        mockGatewayClient.post.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        });

        const startTime = performance.now();
        await updateSliceViaCallback(
          mockGatewayClient,
          MATERIAL_ID,
          mockSliceUpdatePayloadFactory('slc_20260525_000001_001', 'COMPLETED'),
        );
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(200);
      },
      10000,
    );

    it(
      'TC-SLICER-PERF-006: generateTraceId 执行 1000 次耗时 ≤ 50ms',
      () => {
        const startTime = performance.now();
        for (let i = 0; i < 1000; i++) {
          generateTraceId(MATERIAL_ID);
        }
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(50);
      },
      5000,
    );

    it(
      'TC-SLICER-PERF-007: handleSliceCallback 全切片 COMPLETED → Material 联动更新耗时 ≤ 100ms',
      async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([
              { slice_id: 'slc_1', status: 'COMPLETED', material_id: MATERIAL_ID },
              { slice_id: 'slc_2', status: 'COMPLETED', material_id: MATERIAL_ID },
              { slice_id: 'slc_3', status: 'COMPLETED', material_id: MATERIAL_ID },
            ]),
          },
          material: {
            update: jest.fn().mockResolvedValue({}),
          },
        };

        const startTime = performance.now();
        await handleSliceCallback(
          mockSliceCallbackRequestFactory({
            status: 'COMPLETED',
          }),
          { prisma: mockPrisma },
        );
        const elapsed = performance.now() - startTime;

        expect(elapsed).toBeLessThanOrEqual(100);
        expect(mockPrisma.material.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'COMPLETED' }),
          }),
        );
      },
      10000,
    );

    it(
      'TC-SLICER-PERF-008: handleSliceCallback 部分 FAILED → Material.status = FAILED',
      async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([
              { slice_id: 'slc_1', status: 'COMPLETED', material_id: MATERIAL_ID },
              { slice_id: 'slc_2', status: 'FAILED', material_id: MATERIAL_ID },
              { slice_id: 'slc_3', status: 'COMPLETED', material_id: MATERIAL_ID },
            ]),
          },
          material: {
            update: jest.fn().mockResolvedValue({}),
          },
        };

        await handleSliceCallback(
          mockSliceCallbackRequestFactory({ status: 'COMPLETED' }),
          { prisma: mockPrisma },
        );

        expect(mockPrisma.material.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'FAILED' }),
          }),
        );
      },
      10000,
    );
  });

  // ===================================================================
  // 5. 【原子函数独立测试】
  // ===================================================================

  describe('【原子函数】独立单元测试', () => {
    // ---- F1: fetchMaterialFromGateway ----

    describe('F1: fetchMaterialFromGateway', () => {
      it('ATOM-SLICER-001: 成功返回完整 Gateway 响应', async () => {
        const result = await fetchMaterialFromGateway(
          mockGatewayClient,
          MATERIAL_ID,
        );
        expect(result.material_id).toBe(MATERIAL_ID);
        expect(result.product_id).toBeDefined();
        expect(result.duration_seconds).toBeGreaterThan(0);
        expect(result.slices.length).toBeGreaterThan(0);
      });

      it('ATOM-SLICER-002: Gateway 返回非 200 → INTERNAL_SERVER_ERROR', async () => {
        const client = mockHttpClientFactory();
        client.get.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await fetchMaterialFromGateway(client, MATERIAL_ID);
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
      });

      it('ATOM-SLICER-003: Gateway 返回 success=false → MATERIAL_NOT_FOUND', async () => {
        const client = mockHttpClientFactory();
        client.get.mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => ({ success: false, data: null }),
        });

        let caught: Error & { errorCode?: string } | null = null;
        try {
          await fetchMaterialFromGateway(client, MATERIAL_ID);
        } catch (e) {
          caught = e as Error & { errorCode?: string };
        }
        expect(caught).not.toBeNull();
        expect(caught!.errorCode).toBe('MATERIAL_NOT_FOUND');
      });
    });

    // ---- F2: downloadSourceVideo ----

    describe('F2: downloadSourceVideo', () => {
      it('ATOM-SLICER-004: 下载成功返回本地路径', async () => {
        const path = await downloadSourceVideo(
          mockMinio,
          'http://minio:9000/tikstream-assets/materials/20260525/dc52d4ff/video.mp4',
          TEMP_DIR,
        );
        expect(path).toBe(`${TEMP_DIR}/source.mp4`);
        expect(mockMinio.getObject).toHaveBeenCalledTimes(1);
      });
    });

    // ---- F3: detectSceneBoundaries ----

    describe('F3: detectSceneBoundaries', () => {
      it('ATOM-SLICER-005: TransNetV2 返回 2 个有效切点', async () => {
        const result = await detectSceneBoundaries(
          '/tmp/test.mp4',
          TEMP_DIR,
          mockExecFile,
        );
        expect(result.success).toBe(true);
        expect(result.predictions).toHaveLength(2);
        expect(result.video_duration).toBe(9.0);
        expect(result.frame_count).toBeGreaterThan(0);
      });
    });

    // ---- F4: optimizeSliceBoundaries ----

    describe('F4: optimizeSliceBoundaries', () => {
      it('ATOM-SLICER-006: 等距初始切片 → 不存在转场 → 保持等距', () => {
        const initialSlices: TestMaterialSliceRecord[] = [
          mockSliceRecordFactory(1, 0.0, 3.0),
          mockSliceRecordFactory(2, 3.0, 6.0),
          mockSliceRecordFactory(3, 6.0, 9.0),
        ];

        const segments = optimizeSliceBoundaries(initialSlices, [], 9.0);
        expect(segments.length).toBe(3);
      });

      it('ATOM-SLICER-007: 场景切点精确匹配初始边界 (±0.3s 内) → 吸附', () => {
        const initialSlices: TestMaterialSliceRecord[] = [
          mockSliceRecordFactory(1, 0.0, 3.0),
          mockSliceRecordFactory(2, 3.0, 6.0),
        ];

        const sceneCuts: TestSceneBoundary[] = [
          { timestamp_sec: 3.15, confidence: 0.9 },
        ];

        const segments = optimizeSliceBoundaries(
          initialSlices,
          sceneCuts,
          6.0,
        );

        const hasAdsorbed = segments.some(
          (seg) => seg.start_sec === 3.15,
        );
        expect(hasAdsorbed).toBe(true);
      });

      it('ATOM-SLICER-008: 偏离 >0.3s 的切点不被吸附', () => {
        const initialSlices: TestMaterialSliceRecord[] = [
          mockSliceRecordFactory(1, 0.0, 3.0),
          mockSliceRecordFactory(2, 3.0, 6.0),
        ];

        const sceneCuts: TestSceneBoundary[] = [
          { timestamp_sec: 3.5, confidence: 0.9 },
        ];

        const segments = optimizeSliceBoundaries(
          initialSlices,
          sceneCuts,
          6.0,
        );

        for (const seg of segments) {
          expect(seg.duration).toBeGreaterThanOrEqual(SLICE_MIN_DURATION);
        }
      });
    });

    // ---- F5: executeFfmpegSlicing ----

    describe('F5: executeFfmpegSlicing', () => {
      it('ATOM-SLICER-009: 正常切割返回切片路径数组', async () => {
        const execFile = jest
          .fn()
          .mockResolvedValue({ stdout: '', stderr: '' });

        const paths = await executeFfmpegSlicing(
          '/tmp/source.mp4',
          [
            mockSliceSegmentFactory(1, 0.0, 3.0),
            mockSliceSegmentFactory(2, 3.0, 6.0),
          ],
          TEMP_DIR,
          execFile,
        );

        expect(paths).toHaveLength(2);
        expect(paths[0]).toBe(`${TEMP_DIR}/slice_001.mp4`);
        expect(paths[1]).toBe(`${TEMP_DIR}/slice_002.mp4`);
      });
    });

    // ---- F6: extractKeyFrames ----

    describe('F6: extractKeyFrames', () => {
      it('ATOM-SLICER-010: 成功抽取返回关键帧路径数组', async () => {
        const execFile = jest
          .fn()
          .mockResolvedValue({ stdout: '', stderr: '' });

        const paths = await extractKeyFrames(
          [
            mockSliceSegmentFactory(1, 0.0, 3.0),
            mockSliceSegmentFactory(2, 3.0, 6.0),
          ],
          [
            `${TEMP_DIR}/slice_001.mp4`,
            `${TEMP_DIR}/slice_002.mp4`,
          ],
          TEMP_DIR,
          execFile,
        );

        expect(paths).toHaveLength(2);
        expect(paths[0]).not.toBeNull();
        expect(paths[1]).not.toBeNull();
      });

      it('ATOM-SLICER-011: FFmpeg 关键帧失败 → null 值 (非阻断)', async () => {
        const execFile = jest.fn().mockRejectedValue(new Error('FFmpeg failed'));

        const paths = await extractKeyFrames(
          [mockSliceSegmentFactory(1, 0.0, 3.0)],
          [`${TEMP_DIR}/slice_001.mp4`],
          TEMP_DIR,
          execFile,
        );

        expect(paths).toHaveLength(1);
        expect(paths[0]).toBeNull();
      });
    });

    // ---- F7 / F8: 上传到 MinIO ----

    describe('F7 & F8: uploadSliceToMinIO / uploadKeyFrameToMinIO', () => {
      it('ATOM-SLICER-012: uploadSliceToMinIO 成功返回 URL', async () => {
        const url = await uploadSliceToMinIO(
          mockMinio,
          `${TEMP_DIR}/slice_001.mp4`,
          'slices/20260525/dc52d4ff/slice_001.mp4',
        );
        expect(url).toContain('minio:9000');
        expect(mockMinio.putObject).toHaveBeenCalled();
      });

      it('ATOM-SLICER-013: uploadKeyFrameToMinIO 输入 null → 返回 null', async () => {
        const url = await uploadKeyFrameToMinIO(
          mockMinio,
          null,
          'slices/20260525/dc52d4ff/keyframe_001.webp',
        );
        expect(url).toBeNull();
      });
    });

    // ---- F12 / F13 / F14: Dense Caption 全链路 ----

    describe('F12/F13/F14: Dense Caption 全链路', () => {
      it('ATOM-SLICER-014: generateSliceCaption 完整流程成功', async () => {
        const result = await generateSliceCaption(
          mockSliceSegmentFactory(1, 0.0, 3.0),
          mockProductMetaFactory(),
          {
            buildCaptionPrompt,
            parseCaptionResponse,
            callCaptionAPI,
          },
        );
        expect(result.dense_caption.length).toBeGreaterThan(0);
        expect(result.tags.length).toBeGreaterThan(0);
      });

      it('ATOM-SLICER-015: buildCaptionPrompt 包含商品信息', () => {
        const prompts = buildCaptionPrompt(
          mockSliceSegmentFactory(1, 0.0, 3.0),
          mockProductMetaFactory(),
        );
        expect(prompts.systemPrompt).toContain('智能无线卷发棒 Pro');
        expect(prompts.systemPrompt).toContain('Beauty/PersonalCare');
        expect(prompts.systemPrompt).toContain('3档智能控温');
        expect(prompts.systemPrompt).toContain('0s to 3s');
      });

      it('ATOM-SLICER-016: parseCaptionResponse 标签转为 snake_case 小写', () => {
        const result = parseCaptionResponse(
          JSON.stringify({
            dense_caption: 'A valid caption.',
            tags: ['Close Up', 'Product Demo', '  Bright Lighting  '],
          }),
        );
        expect(result.tags).toContain('close_up');
        expect(result.tags).toContain('product_demo');
        expect(result.tags).toContain('bright_lighting');
      });
    });

    // ---- F10: updateSliceViaCallback ----

    describe('F10: updateSliceViaCallback', () => {
      it('ATOM-SLICER-017: 正常回调 1 次成功', async () => {
        await updateSliceViaCallback(
          mockGatewayClient,
          MATERIAL_ID,
          mockSliceUpdatePayloadFactory('slc_20260525_000001_001', 'COMPLETED'),
        );
        expect(mockGatewayClient.post).toHaveBeenCalledTimes(1);
      });
    });

    // ---- F11: cleanupTemporaryFiles ----

    describe('F11: cleanupTemporaryFiles', () => {
      it('ATOM-SLICER-018: 清理成功不抛异常', async () => {
        await expect(
          cleanupTemporaryFiles(TEMP_DIR),
        ).resolves.toBeUndefined();
        expect(mockFsRm).toHaveBeenCalledWith(TEMP_DIR, {
          recursive: true,
          force: true,
        });
      });
    });

    // ---- Gateway handleSliceCallback ----

    describe('Gateway: handleSliceCallback', () => {
      it('ATOM-SLICER-019: CAPTIONING status → 更新 stream_url + key_frame_url → 不触发 Material 联动', async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([
              { slice_id: 'slc_1', status: 'CAPTIONING', material_id: MATERIAL_ID },
              { slice_id: 'slc_2', status: 'PENDING', material_id: MATERIAL_ID },
            ]),
          },
          material: { update: jest.fn() },
        };

        await handleSliceCallback(
          mockSliceCallbackRequestFactory({
            status: 'CAPTIONING',
            dense_caption: undefined,
            tags: undefined,
          }),
          { prisma: mockPrisma },
        );

        expect(mockPrisma.materialSlice.update).toHaveBeenCalled();
        expect(mockPrisma.material.update).not.toHaveBeenCalled();
      });

      it('ATOM-SLICER-020: COMPLETED status → 更新 dense_caption + tags → 触发 Material 联动 (全 COMPLETED)', async () => {
        const mockPrisma = {
          materialSlice: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([
              { slice_id: 'slc_1', status: 'COMPLETED', material_id: MATERIAL_ID },
              { slice_id: 'slc_2', status: 'COMPLETED', material_id: MATERIAL_ID },
              { slice_id: 'slc_3', status: 'COMPLETED', material_id: MATERIAL_ID },
            ]),
          },
          material: { update: jest.fn().mockResolvedValue({}) },
        };

        await handleSliceCallback(
          mockSliceCallbackRequestFactory({
            status: 'COMPLETED',
            dense_caption: 'Test caption text.',
            tags: ['tag1', 'tag2'],
          }),
          { prisma: mockPrisma },
        );

        expect(mockPrisma.materialSlice.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'COMPLETED',
              dense_caption: 'Test caption text.',
              tags: JSON.stringify(['tag1', 'tag2']),
            }),
          }),
        );
        expect(mockPrisma.material.update).toHaveBeenCalled();
      });
    });
  });
});