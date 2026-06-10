import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { InternalStatsController } from './internal-stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [PrismaModule],
  controllers: [InternalStatsController],
  providers: [StatsService],
})
export class StatsModule {}
