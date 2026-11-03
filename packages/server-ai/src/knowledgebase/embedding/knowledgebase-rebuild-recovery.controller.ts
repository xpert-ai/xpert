import { t } from 'i18next'
import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common'
import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions, TenantScopeGuard, UUIDValidationPipe, ZodValidationPipe } from '@xpert-ai/server-core'
import { KnowledgebaseService } from '../management/knowledgebase.service'
import { embeddingRecoverySchema, EmbeddingRecoveryInput } from './embedding-recovery.schema'

@Controller()
@UseGuards(TenantScopeGuard)
@Permissions(AIPermissionsEnum.KNOWLEDGEBASE_EDIT)
export class KnowledgebaseRebuildRecoveryController {
    constructor(private readonly knowledgebases: KnowledgebaseService) {}

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
