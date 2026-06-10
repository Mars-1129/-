import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { AutocutController } from './autocut.controller';
import { AutocutService } from './autocut.service';
import { AutocutInternalController } from './internal-autocut.controller';

@Module({
  imports: [PrismaModule],
  controllers: [AutocutController, AutocutInternalController],
  providers: [AutocutService],
  exports: [AutocutService],
})
export class AutocutModule {}
