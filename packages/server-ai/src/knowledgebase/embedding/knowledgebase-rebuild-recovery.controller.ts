import { t } from 'i18next'
import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions, TenantScopeGuard, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { embeddingRebuildSchema, EmbeddingRebuildInput } from './embedding-rebuild.schema'
import { embeddingRecoverySchema, EmbeddingRecoveryInput } from './embedding-recovery.schema'

@Controller()
@UseGuards(TenantScopeGuard)
@Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
export class KnowledgebaseRebuildRecoveryController {
    constructor(private readonly knowledgebases: KnowledgebaseService) {}

    @Post(':id/rebuild-embedding')
    retry(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(
            new ZodValidationPipe(
                embeddingRebuildSchema,
                () =>
                    new BadRequestException({
                        code: 'embedding_rebuild_invalid',
                        message: t('server-ai:Error.EmbeddingBatchSizeInvalid')
                    })
            )
        )
        input: EmbeddingRebuildInput
    ) {
        return this.knowledgebases.startEmbeddingRebuild(id, input)
    }

    @Post(':id/recover-embedding-rebuild')
    recover(
        @Param('id', UUIDValidationPipe) id: string,
        @Body(
            new ZodValidationPipe(
                embeddingRecoverySchema,
                () =>
                    new BadRequestException({
                        code: 'embedding_recovery_invalid',
                        message: t('server-ai:Error.EmbeddingRebuildRecoveryInvalid')
                    })
            )
        )
        _input: EmbeddingRecoveryInput
    ) {
        return this.knowledgebases.recoverEmbeddingRebuild(id)
    }
}
