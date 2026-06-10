import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClientService } from '../../services/ai/qdrant-client.service';

@Injectable()
export class MaterialBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(MaterialBootstrapService.name);

  constructor(@Inject(QdrantClientService) private readonly qdrant: QdrantClientService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Qdrant collections...');
    try {
      await this.qdrant.ensureCollection();
      this.logger.log('Qdrant asset_slices collection ready');
    } catch (error) {
      this.logger.error(`Failed to ensure asset_slices collection: ${(error as Error).message}`);
    }
    try {
      await this.qdrant.ensureCollection(this.qdrant.getMaterialCollectionName());
      this.logger.log('Qdrant asset_materials collection ready');
    } catch (error) {
      this.logger.error(`Failed to ensure asset_materials collection: ${(error as Error).message}`);
    }
  }
}
