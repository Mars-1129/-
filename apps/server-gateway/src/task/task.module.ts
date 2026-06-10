import { Module, forwardRef } from '@nestjs/common';
import { CreationModule } from '../creation/creation.module';
import { TaskController } from './task.controller';

@Module({
  imports: [forwardRef(() => CreationModule)],
  controllers: [TaskController],
  exports: [],
})
export class TaskModule {}
