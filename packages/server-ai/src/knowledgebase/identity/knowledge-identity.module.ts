import { forwardRef, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { KnowledgebaseModule } from '../knowledgebase.module'
import { KnowledgeIdentityEmbeddingService } from './knowledge-identity-embedding.service'
import { KnowledgeIdentityObservation } from './knowledge-identity-observation.entity'
import { KnowledgeIdentity } from './knowledge-identity.entity'
import { KnowledgeIdentityService } from './knowledge-identity.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([KnowledgeIdentity, KnowledgeIdentityObservation]),
        forwardRef(() => KnowledgebaseModule)
    ],
    providers: [KnowledgeIdentityService, KnowledgeIdentityEmbeddingService],
    exports: [KnowledgeIdentityService]
})
export class KnowledgeIdentityModule {}
