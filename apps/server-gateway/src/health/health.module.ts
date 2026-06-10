import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService, DoubaoTextProvider],
})
export class HealthModule {}
