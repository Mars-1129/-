import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { CommentRepository } from './comment.repository';
import { TikTokCommentClient } from './tiktok-comment-client';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { SiliconFlowTextProvider } from '../../services/ai/siliconflow-text.provider';

@Module({
  imports: [PrismaModule],
  controllers: [CommentController],
  providers: [CommentService, CommentRepository, TikTokCommentClient, DoubaoTextProvider, SiliconFlowTextProvider],
  exports: [CommentService],
})
export class CommentModule {}
