// =============================================================================
// TikStream AI — Task Delete 自动化测试基座
// 对应功能: DELETE /api/v1/tasks/:taskId (任务软删除)
//           POST /api/v1/tasks/:taskId/restore (任务恢复)
//           DELETE /api/v1/tasks/:taskId/permanent (永久删除)
//           POST /api/v1/tasks/batch-delete (批量删除)
//           DELETE /api/v1/tasks/trash/empty (清空回收站)
// 对应模块: Task (人员B) | 技术栈: Jest 29 + jest.fn
// =============================================================================

import { HttpStatus } from '@nestjs/common';

// =============================================================================
// 0. 测试专用类型定义
// =============================================================================

type TaskStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type TaskDeletedStatus = 'ACTIVE' | 'SOFT_DELETED' | 'PERMANENTLY_DELETED';

interface TestTask {
  id: string;
  product_id: string;
  title: string;
  type: string;
  status: string;
  deleted_status: string;
  deleted_at: Date | null;
  progress: number;
  result_json: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

type MockPrismaService = {
  task: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

// =============================================================================
// 常量
// =============================================================================

const NOW = new Date('2026-06-01T12:00:00Z');
const TASK_ID_1 = 'dc52d4ff-0000-4000-a000-0000000000a1';
const TASK_ID_2 = 'dc52d4ff-0000-4000-a000-0000000000a2';
const TASK_ID_3 = 'dc52d4ff-0000-4000-a000-0000000000a3';
const PRODUCT_ID = '00000000-0000-0000-0000-000000000001';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SOFT_DELETE_RETENTION_DAYS = 30;

// =============================================================================
// Mock Factories
// =============================================================================

const mockTaskFactory = (overrides?: Partial<TestTask>): TestTask => ({
  id: TASK_ID_1,
  product_id: PRODUCT_ID,
  title: '智能无线卷发棒-快速成片任务',
  type: 'QUICK_GENERATE',
  status: 'COMPLETED',
  deleted_status: 'ACTIVE',
  deleted_at: null,
  progress: 100,
  result_json: { script_id: 'dc52d4ff-0000-4000-a000-0000000000b1' },
  error_message: null,
  created_at: NOW,
  updated_at: NOW,
  ...overrides,
});

const mockDeletedTaskFactory = (overrides?: Partial<TestTask>): TestTask => ({
  id: TASK_ID_2,
  product_id: PRODUCT_ID,
  title: '已删除任务',
  type: 'TEMPLATE_GENERATE',
  status: 'COMPLETED',
  deleted_status: 'SOFT_DELETED',
  deleted_at: new Date(NOW.getTime() - 24 * 3600 * 1000),
  progress: 100,
  result_json: null,
  error_message: null,
  created_at: new Date(NOW.getTime() - 48 * 3600 * 1000),
  updated_at: new Date(NOW.getTime() - 24 * 3600 * 1000),
  ...overrides,
});

const mockPrismaServiceFactory = (): MockPrismaService => {
  const client = {
    task: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as MockPrismaService;

  client.$transaction.mockImplementation(
    async (fn: (tx: Omit<MockPrismaService, '$transaction'>) => Promise<unknown>) => fn(client),
  );

  return client;
};

// =============================================================================
// 测试套件入口
// =============================================================================

describe('TaskDelete — 任务软删除、恢复、永久删除、批量删除、清空回收站', () => {
  let mockPrisma: MockPrismaService;

  // ---- 原子函数类型声明 ----

  let validateTaskId: (taskId: string) => void;
  let validateTaskIds: (taskIds: string[]) => void;
  let findTaskById: (prisma: MockPrismaService, taskId: string) => Promise<TestTask>;
  let softDeleteTask: (prisma: MockPrismaService, taskId: string) => Promise<TestTask>;
  let restoreTask: (prisma: MockPrismaService, taskId: string) => Promise<TestTask>;
  let permanentDeleteTask: (prisma: MockPrismaService, taskId: string) => Promise<void>;
  let batchSoftDeleteTasks: (prisma: MockPrismaService, taskIds: string[]) => Promise<{ affected: number }>;
  let emptyTrash: (prisma: MockPrismaService) => Promise<{ deleted_count: number }>;
  let isSoftDeleted: (task: TestTask) => boolean;
  let isRestorable: (task: TestTask) => boolean;
  let isExpired: (task: TestTask, retentionDays: number) => boolean;

  // ---- 编排函数 ----

  let deleteTask: (taskId: string, deps: { prisma: MockPrismaService }) => Promise<TestTask>;
  let restoreDeletedTask: (taskId: string, deps: { prisma: MockPrismaService }) => Promise<TestTask>;
  let forceDeleteTask: (taskId: string, deps: { prisma: MockPrismaService }) => Promise<void>;
  let batchDeleteTasks: (taskIds: string[], deps: { prisma: MockPrismaService }) => Promise<{ affected: number }>;
  let clearTrash: (deps: { prisma: MockPrismaService }) => Promise<{ deleted_count: number }>;

  beforeAll(() => {
    // ---- validateTaskId ----
    validateTaskId = (taskId: string) => {
      if (!taskId || taskId.trim().length === 0) {
        throw Object.assign(new Error('task_id 为必填字段'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      const trimmed = taskId.trim();
      if (!UUID_V4_REGEX.test(trimmed)) {
        throw Object.assign(new Error(`task_id 不是有效的 UUID v4 格式: ${trimmed}`), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
    };

    // ---- validateTaskIds ----
    validateTaskIds = (taskIds: string[]) => {
      if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
        throw Object.assign(new Error('task_ids 必须为非空数组'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      if (taskIds.length > 100) {
        throw Object.assign(new Error('批量操作上限为 100 条'), {
          errorCode: 'BATCH_LIMIT_EXCEEDED',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      const uniqueIds = new Set(taskIds);
      if (uniqueIds.size !== taskIds.length) {
        throw Object.assign(new Error('task_ids 中包含重复 ID'), {
          errorCode: 'INVALID_REQUEST',
          statusCode: HttpStatus.BAD_REQUEST,
          retryable: false,
        });
      }
      for (const id of taskIds) {
        validateTaskId(id);
      }
    };

    // ---- findTaskById ----
    findTaskById = async (prisma: MockPrismaService, taskId: string): Promise<TestTask> => {
      try {
        const record = await prisma.task.findUnique({ where: { id: taskId } });
        if (!record) {
          throw Object.assign(new Error(`任务 ${taskId} 不存在`), {
            errorCode: 'TASK_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
            retryable: false,
          });
        }
        return record as unknown as TestTask;
      } catch (error) {
        const prismaError = error as Error & { errorCode?: string; code?: string };
        if (prismaError.errorCode === 'TASK_NOT_FOUND') throw error;
        throw Object.assign(new Error(`数据库查询失败: ${prismaError.message}`), {
          errorCode: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          retryable: true,
        });
      }
    };

    // ---- isSoftDeleted ----
    isSoftDeleted = (task: TestTask): boolean => {
      return task.deleted_status === 'SOFT_DELETED';
    };

    // ---- isRestorable ----
    isRestorable = (task: TestTask): boolean => {
      return task.deleted_status === 'SOFT_DELETED' && task.deleted_at !== null;
    };

    // ---- isExpired ----
    isExpired = (task: TestTask, retentionDays: number): boolean => {
      if (!task.deleted_at) return false;
      const expiresAt = new Date(task.deleted_at.getTime() + retentionDays * 24 * 3600 * 1000);
      return new Date() > expiresAt;
    };

    // ---- softDeleteTask ----
    softDeleteTask = async (prisma: MockPrismaService, taskId: string): Promise<TestTask> => {
      try {
        const updated = await prisma.task.update({
          where: { id: taskId },
          data: {
            deleted_status: 'SOFT_DELETED',
            deleted_at: new Date(),
          },
        });
        return updated as unknown as TestTask;
      } catch (error) {
        const prismaError = error as Error & { code?: string };
        if (prismaError.code === 'P2025') {
          throw Object.assign(new Error(`任务 ${taskId} 不存在`), {
            errorCode: 'TASK_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
          });
        }
        throw Object.assign(new Error(`软删除失败: ${prismaError.message}`), {
          errorCode: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        });
      }
    };

    // ---- restoreTask ----
    restoreTask = async (prisma: MockPrismaService, taskId: string): Promise<TestTask> => {
      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          deleted_status: 'ACTIVE',
          deleted_at: null,
        },
      });
      return updated as unknown as TestTask;
    };

    // ---- permanentDeleteTask ----
    permanentDeleteTask = async (prisma: MockPrismaService, taskId: string): Promise<void> => {
      try {
        await prisma.task.delete({ where: { id: taskId } });
      } catch (error) {
        const prismaError = error as Error & { code?: string };
        if (prismaError.code === 'P2025') {
          throw Object.assign(new Error(`任务 ${taskId} 不存在`), {
            errorCode: 'TASK_NOT_FOUND',
            statusCode: HttpStatus.NOT_FOUND,
          });
        }
        throw Object.assign(new Error(`永久删除失败: ${prismaError.message}`), {
          errorCode: 'INTERNAL_SERVER_ERROR',
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        });
      }
    };

    // ---- batchSoftDeleteTasks ----
    batchSoftDeleteTasks = async (prisma: MockPrismaService, taskIds: string[]): Promise<{ affected: number }> => {
      const result = await prisma.task.updateMany({
        where: { id: { in: taskIds }, deleted_status: 'ACTIVE' },
        data: {
          deleted_status: 'SOFT_DELETED',
          deleted_at: new Date(),
        },
      });
      return { affected: (result as unknown as { count: number }).count || taskIds.length };
    };

    // ---- emptyTrash ----
    emptyTrash = async (prisma: MockPrismaService): Promise<{ deleted_count: number }> => {
      const result = await prisma.task.deleteMany({
        where: { deleted_status: 'SOFT_DELETED' },
      });
      return { deleted_count: (result as unknown as { count: number }).count || 0 };
    };

    // ---- 编排函数: deleteTask ----
    deleteTask = async (taskId, deps) => {
      const { prisma } = deps;
      validateTaskId(taskId);
      const existing = await findTaskById(prisma, taskId);

      if (isSoftDeleted(existing)) {
        throw Object.assign(new Error(`任务 ${taskId} 已在回收站中`), {
          errorCode: 'TASK_ALREADY_DELETED',
          statusCode: HttpStatus.CONFLICT,
        });
      }

      const result = await softDeleteTask(prisma, taskId);
      return result;
    };

    // ---- 编排函数: restoreDeletedTask ----
    restoreDeletedTask = async (taskId, deps) => {
      const { prisma } = deps;
      validateTaskId(taskId);
      const existing = await findTaskById(prisma, taskId);

      if (!isSoftDeleted(existing)) {
        throw Object.assign(new Error(`任务 ${taskId} 不在回收站中，无需恢复`), {
          errorCode: 'TASK_NOT_IN_TRASH',
          statusCode: HttpStatus.CONFLICT,
        });
      }

      if (isExpired(existing, SOFT_DELETE_RETENTION_DAYS)) {
        throw Object.assign(new Error(`任务 ${taskId} 已超过 ${SOFT_DELETE_RETENTION_DAYS} 天保留期，无法恢复`), {
          errorCode: 'TASK_RESTORE_EXPIRED',
          statusCode: HttpStatus.GONE,
        });
      }

      const result = await restoreTask(prisma, taskId);
      return result;
    };

    // ---- 编排函数: forceDeleteTask ----
    forceDeleteTask = async (taskId, deps) => {
      const { prisma } = deps;
      validateTaskId(taskId);
      const existing = await findTaskById(prisma, taskId);

      if (!isSoftDeleted(existing)) {
        throw Object.assign(new Error('仅可永久删除回收站中的任务'), {
          errorCode: 'TASK_NOT_IN_TRASH',
          statusCode: HttpStatus.CONFLICT,
        });
      }

      await permanentDeleteTask(prisma, taskId);
    };

    // ---- 编排函数: batchDeleteTasks ----
    batchDeleteTasks = async (taskIds, deps) => {
      const { prisma } = deps;
      validateTaskIds(taskIds);
      return batchSoftDeleteTasks(prisma, taskIds);
    };

    // ---- 编排函数: clearTrash ----
    clearTrash = async (deps) => {
      const { prisma } = deps;
      return emptyTrash(prisma);
    };
  });

  beforeEach(() => {
    mockPrisma = mockPrismaServiceFactory();
  });

  // ===========================================================================
  // 1. 正常流（Happy Path）
  // ===========================================================================

  describe('【正常流】合法输入 → 完整数据契约输出', () => {
    const activeTask = mockTaskFactory();
    const deletedTask = mockDeletedTaskFactory();

    it('TC-TSK-DEL-001: 软删除活跃任务 → 返回 deleted_status=SOFT_DELETED', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(activeTask);
      mockPrisma.task.update.mockResolvedValue({
        ...activeTask,
        deleted_status: 'SOFT_DELETED',
        deleted_at: new Date(),
      });

      const result = await deleteTask(TASK_ID_1, { prisma: mockPrisma });

      expect(result).toHaveProperty('deleted_status', 'SOFT_DELETED');
      expect(result).toHaveProperty('deleted_at');
      expect(result.deleted_at).toBeInstanceOf(Date);
      expect(result.id).toBe(TASK_ID_1);
    });

    it('TC-TSK-DEL-002: 恢复软删除任务 → 返回 deleted_status=ACTIVE', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(deletedTask);
      mockPrisma.task.update.mockResolvedValue({
        ...deletedTask,
        deleted_status: 'ACTIVE',
        deleted_at: null,
      });

      const result = await restoreDeletedTask(TASK_ID_2, { prisma: mockPrisma });

      expect(result).toHaveProperty('deleted_status', 'ACTIVE');
      expect(result).toHaveProperty('deleted_at', null);
      expect(result.id).toBe(TASK_ID_2);
    });

    it('TC-TSK-DEL-003: 永久删除回收站任务 → 不抛异常', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(deletedTask);
      mockPrisma.task.delete.mockResolvedValue(deletedTask);

      await expect(
        forceDeleteTask(TASK_ID_2, { prisma: mockPrisma }),
      ).resolves.toBeUndefined();

      expect(mockPrisma.task.delete).toHaveBeenCalledWith({
        where: { id: TASK_ID_2 },
      });
    });

    it('TC-TSK-DEL-004: 批量删除多个任务 → 返回 affected 数量', async () => {
      const taskIds = [TASK_ID_1, TASK_ID_2, TASK_ID_3];
      mockPrisma.task.updateMany.mockResolvedValue({ count: 3 });

      const result = await batchDeleteTasks(taskIds, { prisma: mockPrisma });

      expect(result).toHaveProperty('affected', 3);
    });

    it('TC-TSK-DEL-005: 清空回收站 → 返回 deleted_count', async () => {
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 5 });

      const result = await clearTrash({ prisma: mockPrisma });

      expect(result).toHaveProperty('deleted_count', 5);
      expect(mockPrisma.task.deleteMany).toHaveBeenCalledWith({
        where: { deleted_status: 'SOFT_DELETED' },
      });
    });

    it('TC-TSK-DEL-006: 批量删除 100 条任务(上限)正常工作', async () => {
      const taskIds = Array.from({ length: 100 }, (_, i) =>
        `dc52d4ff-0000-4000-a000-0000000000${String(i).padStart(2, '0')}`,
      );
      mockPrisma.task.updateMany.mockResolvedValue({ count: 100 });

      const result = await batchDeleteTasks(taskIds, { prisma: mockPrisma });

      expect(result.affected).toBe(100);
    });
  });

  // ===========================================================================
  // 2. 边界流（Edge Cases）
  // ===========================================================================

  describe('【边界流】极端输入 → 系统优雅处理', () => {
    it('TC-TSK-DEL-BND-001: task_id 首尾含空格 → trim 后正常处理', async () => {
      const activeTask = mockTaskFactory();
      mockPrisma.task.findUnique.mockResolvedValue(activeTask);
      mockPrisma.task.update.mockResolvedValue({
        ...activeTask,
        deleted_status: 'SOFT_DELETED',
        deleted_at: new Date(),
      });

      const result = await deleteTask(`  ${TASK_ID_1}  `, { prisma: mockPrisma });

      expect(result.deleted_status).toBe('SOFT_DELETED');
    });

    it('TC-TSK-DEL-BND-002: 空回收站清空 → deleted_count=0', async () => {
      mockPrisma.task.deleteMany.mockResolvedValue({ count: 0 });

      const result = await clearTrash({ prisma: mockPrisma });

      expect(result.deleted_count).toBe(0);
    });

    it('TC-TSK-DEL-BND-003: 批量删除单条任务 → 正常执行', async () => {
      mockPrisma.task.updateMany.mockResolvedValue({ count: 1 });

      const result = await batchDeleteTasks([TASK_ID_1], { prisma: mockPrisma });

      expect(result.affected).toBe(1);
    });

    it('TC-TSK-DEL-BND-004: isExpired 恰好在到期边界前一天 → 仍可恢复', () => {
      const task = mockDeletedTaskFactory({
        deleted_at: new Date(Date.now() - (SOFT_DELETE_RETENTION_DAYS - 1) * 24 * 3600 * 1000),
      });

      expect(isExpired(task, SOFT_DELETE_RETENTION_DAYS)).toBe(false);
    });

    it('TC-TSK-DEL-BND-005: isExpired 恰好在到期边界当天(超时) → 不可恢复', () => {
      const task = mockDeletedTaskFactory({
        deleted_at: new Date(Date.now() - (SOFT_DELETE_RETENTION_DAYS + 0.1) * 24 * 3600 * 1000),
      });

      expect(isExpired(task, SOFT_DELETE_RETENTION_DAYS)).toBe(true);
    });

    it('TC-TSK-DEL-BND-006: isRestorable 对未设置 deleted_at 的已删除任务返回 false', () => {
      const task = mockDeletedTaskFactory({ deleted_status: 'SOFT_DELETED', deleted_at: null });

      expect(isRestorable(task)).toBe(false);
    });

    it('TC-TSK-DEL-BND-007: 批量删除时仅更新 ACTIVE 状态任务', async () => {
      mockPrisma.task.updateMany.mockResolvedValue({ count: 2 });

      await batchDeleteTasks([TASK_ID_1, TASK_ID_2], { prisma: mockPrisma });

      expect(mockPrisma.task.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deleted_status: 'ACTIVE' }),
        }),
      );
    });
  });

  // ===========================================================================
  // 3. 异常流（Error Flow）
  // ===========================================================================

  describe('【异常流】人为制造报错 → 精准捕获并抛出规范错误码', () => {
    const activeTask = mockTaskFactory();
    const deletedTask = mockDeletedTaskFactory();

    it('TC-TSK-DEL-ERR-001: 软删除时 task_id 为空 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteTask('', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-TSK-DEL-ERR-002: 任务不存在 → TASK_NOT_FOUND', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(null);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteTask(TASK_ID_3, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-TSK-DEL-ERR-003: 重复软删除已在回收站的任务 → TASK_ALREADY_DELETED', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(deletedTask);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteTask(TASK_ID_2, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_ALREADY_DELETED');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-TSK-DEL-ERR-004: 恢复未删除的任务 → TASK_NOT_IN_TRASH', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(activeTask);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await restoreDeletedTask(TASK_ID_1, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_NOT_IN_TRASH');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-TSK-DEL-ERR-005: 恢复超保留期的任务 → TASK_RESTORE_EXPIRED', async () => {
      const expiredTask = mockDeletedTaskFactory({
        deleted_at: new Date(Date.now() - (SOFT_DELETE_RETENTION_DAYS + 5) * 24 * 3600 * 1000),
      });
      mockPrisma.task.findUnique.mockResolvedValue(expiredTask);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await restoreDeletedTask(TASK_ID_2, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_RESTORE_EXPIRED');
      expect(caught!.statusCode).toBe(HttpStatus.GONE);
    });

    it('TC-TSK-DEL-ERR-006: 永久删除非回收站任务 → TASK_NOT_IN_TRASH', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(activeTask);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await forceDeleteTask(TASK_ID_1, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_NOT_IN_TRASH');
      expect(caught!.statusCode).toBe(HttpStatus.CONFLICT);
    });

    it('TC-TSK-DEL-ERR-007: 批量删除空数组 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await batchDeleteTasks([], { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-TSK-DEL-ERR-008: 批量删除超过 100 条 → BATCH_LIMIT_EXCEEDED', async () => {
      const tooManyIds = Array.from({ length: 101 }, (_, i) =>
        `dc52d4ff-0000-4000-a000-0000000000${String(i).padStart(2, '0')}`,
      );

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await batchDeleteTasks(tooManyIds, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('BATCH_LIMIT_EXCEEDED');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-TSK-DEL-ERR-009: 批量删除包含重复 ID → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await batchDeleteTasks([TASK_ID_1, TASK_ID_1, TASK_ID_2], { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('TC-TSK-DEL-ERR-010: 永久删除时 Prisma P2025 → TASK_NOT_FOUND', async () => {
      mockPrisma.task.findUnique.mockResolvedValue(deletedTask);
      const p2025Error = Object.assign(new Error('Record not found'), { code: 'P2025' });
      mockPrisma.task.delete.mockRejectedValue(p2025Error);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await forceDeleteTask(TASK_ID_2, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('TASK_NOT_FOUND');
      expect(caught!.statusCode).toBe(HttpStatus.NOT_FOUND);
    });

    it('TC-TSK-DEL-ERR-011: task_id 非 UUID v4 → INVALID_REQUEST', async () => {
      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await deleteTask('not-a-uuid', { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
      expect(caught!.statusCode).toBe(HttpStatus.BAD_REQUEST);
    });

    it('TC-TSK-DEL-ERR-012: 恢复时 Prisma query 出错 → INTERNAL_SERVER_ERROR', async () => {
      const dbError = Object.assign(new Error('Connection timeout'), { code: 'P1001' });
      mockPrisma.task.findUnique.mockRejectedValue(dbError);

      let caught: Error & { errorCode?: string; statusCode?: number } | null = null;
      try {
        await restoreDeletedTask(TASK_ID_2, { prisma: mockPrisma });
      } catch (e) {
        caught = e as Error & { errorCode?: string; statusCode?: number };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INTERNAL_SERVER_ERROR');
    });
  });

  // ===========================================================================
  // 4. 性能流（Performance Flow）
  // ===========================================================================

  describe('【性能流】耗时卡点告警', () => {
    const activeTask = mockTaskFactory();
    const deletedTask = mockDeletedTaskFactory();

    it('TC-TSK-DEL-PERF-001: deleteTask 编排总耗时 ≤ 100ms', async () => {
      const PERF_CEILING_MS = 100;
      mockPrisma.task.findUnique.mockResolvedValue(activeTask);
      mockPrisma.task.update.mockResolvedValue({
        ...activeTask,
        deleted_status: 'SOFT_DELETED',
        deleted_at: new Date(),
      });

      const start = performance.now();
      await deleteTask(TASK_ID_1, { prisma: mockPrisma });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-TSK-DEL-PERF-002: restoreDeletedTask 编排总耗时 ≤ 100ms', async () => {
      const PERF_CEILING_MS = 100;
      mockPrisma.task.findUnique.mockResolvedValue(deletedTask);
      mockPrisma.task.update.mockResolvedValue({
        ...deletedTask,
        deleted_status: 'ACTIVE',
        deleted_at: null,
      });

      const start = performance.now();
      await restoreDeletedTask(TASK_ID_2, { prisma: mockPrisma });
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-TSK-DEL-PERF-003: validateTaskId ≤ 1ms', () => {
      const PERF_CEILING_MS = 1;
      const start = performance.now();
      validateTaskId(TASK_ID_1);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-TSK-DEL-PERF-004: validateTaskIds (100条) ≤ 5ms', () => {
      const PERF_CEILING_MS = 5;
      const ids = Array.from({ length: 100 }, (_, i) =>
        `dc52d4ff-0000-4000-a000-0000000000${String(i).padStart(2, '0')}`,
      );

      const start = performance.now();
      validateTaskIds(ids);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThanOrEqual(PERF_CEILING_MS);
    });

    it('TC-TSK-DEL-PERF-005: 连续 10 次 deleteTask 无性能退化', async () => {
      const ITERATIONS = 10;
      const PERF_CEILING_MS_PER_ITERATION = 50;
      mockPrisma.task.findUnique.mockResolvedValue(activeTask);
      mockPrisma.task.update.mockResolvedValue({
        ...activeTask,
        deleted_status: 'SOFT_DELETED',
        deleted_at: new Date(),
      });

      const start = performance.now();
      for (let i = 0; i < ITERATIONS; i++) {
        await deleteTask(TASK_ID_1, { prisma: mockPrisma });
      }
      const totalElapsed = performance.now() - start;
      const avgMsPerIteration = totalElapsed / ITERATIONS;

      expect(avgMsPerIteration).toBeLessThanOrEqual(PERF_CEILING_MS_PER_ITERATION);
    }, 10000);
  });

  // ===========================================================================
  // 5. 独立原子函数测试
  // ===========================================================================

  describe('【原子函数】独立校验 validateTaskId / validateTaskIds / isSoftDeleted / isRestorable / isExpired', () => {
    it('validateTaskId — 合法 UUID v4 通过', () => {
      expect(() => validateTaskId('dc52d4ff-0000-4000-a000-0000000000a1')).not.toThrow();
    });

    it('validateTaskId — 空字符串抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateTaskId('');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateTaskId — 非 UUID v4 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateTaskId('xyz-invalid-id');
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('validateTaskIds — 合法 ID 数组通过', () => {
      expect(() =>
        validateTaskIds([TASK_ID_1, TASK_ID_2, TASK_ID_3]),
      ).not.toThrow();
    });

    it('validateTaskIds — 包含非法 ID 抛出 INVALID_REQUEST', () => {
      let caught: Error & { errorCode?: string } | null = null;
      try {
        validateTaskIds([TASK_ID_1, 'bad-id']);
      } catch (e) {
        caught = e as Error & { errorCode?: string };
      }
      expect(caught).not.toBeNull();
      expect(caught!.errorCode).toBe('INVALID_REQUEST');
    });

    it('isSoftDeleted — ACTIVE 任务返回 false', () => {
      const task = mockTaskFactory({ deleted_status: 'ACTIVE' });
      expect(isSoftDeleted(task)).toBe(false);
    });

    it('isSoftDeleted — SOFT_DELETED 任务返回 true', () => {
      const task = mockDeletedTaskFactory();
      expect(isSoftDeleted(task)).toBe(true);
    });

    it('isRestorable — 可恢复任务返回 true', () => {
      const task = mockDeletedTaskFactory();
      expect(isRestorable(task)).toBe(true);
    });

    it('isExpired — 未过期任务返回 false', () => {
      const task = mockDeletedTaskFactory({
        deleted_at: new Date(Date.now() - 5 * 24 * 3600 * 1000),
      });
      expect(isExpired(task, SOFT_DELETE_RETENTION_DAYS)).toBe(false);
    });

    it('isExpired — 已过期任务返回 true', () => {
      const task = mockDeletedTaskFactory({
        deleted_at: new Date(Date.now() - 60 * 24 * 3600 * 1000),
      });
      expect(isExpired(task, SOFT_DELETE_RETENTION_DAYS)).toBe(true);
    });
  });
});
