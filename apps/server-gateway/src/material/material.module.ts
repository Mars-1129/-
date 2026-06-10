import { Module } from '@nestjs/common';
import { PrismaModule } from '@nestjs/prisma';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MaterialController } from './material.controller';
import { InternalMaterialController } from './internal-material.controller';
import { MaterialService } from './material.service';
import { MaterialBootstrapService } from './material-bootstrap.service';
import { MaterialRepository } from './material.repository';
import { MinioClientService } from '../../services/storage/minio-client.service';
import { MediaProbeService } from '../../services/media/media-probe.service';
import { ThumbnailService } from '../../services/media/thumbnail.service';
import { QdrantClientService } from '../../services/ai/qdrant-client.service';
import { ImageBindClientService } from '../../services/ai/imagebind-client.service';
import { ProductRecognitionProvider } from '../../services/ai/product-recognition.provider';
import { DoubaoTextProvider } from '../../services/ai/doubao-text.provider';
import { DoubaoVisionProvider } from '../../services/ai/doubao-vision.provider';
import { SiliconFlowVisionProvider } from '../../services/ai/siliconflow-vision.provider';
import { ProductRepository } from '../product/product.repository';
import { SynonymService } from '../services/synonym/synonym.service';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 200 * 1024 * 1024,
        files: 1,
      },
    }),
  ],
  controllers: [MaterialController, InternalMaterialController],
  providers: [
    MaterialService,
    MaterialBootstrapService,
    MaterialRepository,
    MinioClientService,
    MediaProbeService,
    ThumbnailService,
    QdrantClientService,
    ImageBindClientService,
    ProductRecognitionProvider,
    DoubaoTextProvider,
    DoubaoVisionProvider,
    SiliconFlowVisionProvider,
    ProductRepository,
    SynonymService,
  ],
  exports: [
    MaterialService,
    MaterialRepository,
    SynonymService,
    QdrantClientService,
    ImageBindClientService,
    DoubaoTextProvider,
  ],
})
export class MaterialModule {}
