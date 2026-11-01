import {
    genPipelineKnowledgeBaseKey,
    genPipelineSourceKey,
    IKnowledgebase,
    IWFNKnowledgeBase,
    IWFNSource,
    KnowledgebaseTypeEnum,
    KnowledgeProviderEnum,
    mapTranslationLanguage,
    WorkflowNodeTypeEnum,
    XpertTypeEnum,
    genXpertTriggerKey,
    IWFNTrigger,
    KnowledgeStructureEnum
} from '@xpert-ai/contracts'
import { shortuuid } from '@xpert-ai/server-common'
import { IntegrationService } from '@xpert-ai/server-core'

import { BadRequestException } from '@nestjs/common'

import { KnowledgeStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'

import { I18nService } from 'nestjs-i18n'

import { XpertService } from '../../xpert/xpert.service'
import { Knowledgebase } from '../persistence/knowledgebase.entity'

import { XpertPublishTriggersCommand } from '../../xpert/commands'

import { RequestContext } from '@xpert-ai/plugin-sdk'

import type { KnowledgebaseService } from '../management/knowledgebase.service'
import { CommandBus } from '@nestjs/cqrs'

interface KnowledgebasePipelineOperationsContext {
    assertKnowledgebaseWriteAccess: KnowledgebaseService['assertKnowledgebaseWriteAccess']
    commandBus: CommandBus
    create: KnowledgebaseService['create']
    i18nService: I18nService
    integrationService: IntegrationService
    knowledgeStrategyRegistry: KnowledgeStrategyRegistry
    searchExternalKnowledgebase: KnowledgebaseService['searchExternalKnowledgebase']
    xpertService: XpertService
}

export class KnowledgebasePipelineOperations {
    constructor(private readonly context: KnowledgebasePipelineOperationsContext) {}

    async createPipeline(id: string) {
        const knowledgebase = await this.context.assertKnowledgebaseWriteAccess(id)
        const sourceKey = genPipelineSourceKey()
        const knowledgebaseKey = genPipelineKnowledgeBaseKey()
        const triggerKey = genXpertTriggerKey()
        return await this.context.xpertService.create({
            name: `${knowledgebase.name} Pipeline - ${shortuuid()}`,
            workspaceId: knowledgebase.workspaceId,
            type: XpertTypeEnum.Knowledge,
            latest: true,
            knowledgebase: {
                id: knowledgebase.id
            },
            agent: {
                key: shortuuid(),
                options: {
                    hidden: true
                }
            },
            draft: {
                nodes: [
                    {
                        key: triggerKey,
                        type: 'workflow',
                        position: { x: 20, y: 320 },
                        entity: {
                            key: triggerKey,
                            title: 'Trigger',
                            type: WorkflowNodeTypeEnum.TRIGGER,
                            from: 'chat'
                        } as IWFNTrigger
                    },
                    {
                        key: sourceKey,
                        type: 'workflow',
                        position: { x: 300, y: 320 },
                        entity: {
                            key: sourceKey,
                            title: 'Documents Source',
                            type: WorkflowNodeTypeEnum.SOURCE,
                            provider: 'local-file'
                        } as IWFNSource
                    },
                    {
                        key: knowledgebaseKey,
                        type: 'workflow',
                        position: { x: 680, y: 320 },
                        entity: {
                            key: knowledgebaseKey,
                            title: 'Knowledge Base',
                            type: WorkflowNodeTypeEnum.KNOWLEDGE_BASE,
                            structure: KnowledgeStructureEnum.General
                        } as IWFNKnowledgeBase
                    }
                ],
                connections: [
                    {
                        type: 'edge',
                        key: `${triggerKey}/${sourceKey}`,
                        from: triggerKey,
                        to: sourceKey
                    }
                ]
            }
        })
    }

    async cleanupPipelineBeforeDelete(knowledgebase: Knowledgebase): Promise<void> {
        const pipeline = knowledgebase.pipeline
        if (!pipeline?.id) {
            return
        }

        if (pipeline.publishAt && pipeline.graph?.nodes?.length) {
            await this.context.commandBus.execute(
                new XpertPublishTriggersCommand(
                    {
                        ...pipeline,
                        graph: {
                            nodes: [],
                            connections: []
                        }
                    },
                    {
                        strict: false,
                        previousGraph: pipeline.graph
                    }
                )
            )
        }

        await this.context.xpertService.updateXpert(pipeline.id, {
            active: false,
            publishAt: null,
            deletedAt: new Date()
        })
    }

    async createExternal(entity: Partial<IKnowledgebase>) {
        // Test external integration
        if (!entity.integrationId) {
            throw new BadRequestException(
                await this.context.i18nService.t('xpert.Error.ExternalIntegrationRequired', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            )
        }

        await this.context.searchExternalKnowledgebase(entity, 'test', 1, {})

        return this.context.create({
            ...entity,
            type: KnowledgebaseTypeEnum.External
        })
    }

    async searchExternalKnowledgebase(
        entity: Partial<IKnowledgebase>,
        query: string,
        k: number,
        filter?: Record<string, string>
    ) {
        const integration = await this.context.integrationService.findOneInOrganizationOrTenant(entity.integrationId)
        if (!integration) throw new BadRequestException(t('server-ai:Error.IntegrationUnavailable'))
        const knowledgeStrategy = this.context.knowledgeStrategyRegistry.get(
            integration.provider as unknown as KnowledgeProviderEnum
        )
        if (!knowledgeStrategy) {
            throw new BadRequestException(
                await this.context.i18nService.t('xpert.Error.KnowledgeStrategyNotFound', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode()),
                    args: {
                        provider: integration.provider
                    }
                })
            )
        }
        return await knowledgeStrategy.execute(integration, {
            query,
            k,
            filter,
            options: { knowledgebaseId: entity.extKnowledgebaseId }
        })
    }
}
