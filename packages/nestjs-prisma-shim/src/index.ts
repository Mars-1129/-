import { Global, Inject, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

export const InjectPrisma = (): ParameterDecorator => Inject(PRISMA_CLIENT);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    // 始终尝试连接数据库（即使 analytics mock 模式开启）
    // analytics 模块有自己的 mock 降级机制，不依赖跳过数据库连接
    try {
      await this.$connect();
      console.log('[PrismaService] Database connected successfully');
    } catch (error) {
      const errMsg = (error as Error)?.message || String(error);
      console.warn(
        `[PrismaService] ⚠️  Database connection failed: ${errMsg}\n` +
        '  Analytics 模块将使用 mock 数据降级。\n' +
        '  非 Analytics 模块（Material, Script, Creation 等）将无法正常工作。',
      );
      // 不抛出错误，允许应用在无数据库时启动（analytics mock 模式兼容）
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      console.log('[PrismaService] Database disconnected');
    } catch (error) {
      // 可能因为连接未建立而失败，忽略
    }
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useClass: PrismaService,
    },
    PrismaService,
  ],
  exports: [PRISMA_CLIENT, PrismaService],
})
export class PrismaModule {}
