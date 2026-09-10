import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { IntegrationService } from '@xpert-ai/server-core'
import { type KnowledgebaseProcessingOptionsResult } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { extname } from 'node:path'
import { resolveKnowledgeDocumentParserConfig } from '../../../knowledge-document/parser-config'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { GetKnowledgebaseProcessingOptionsCommand } from '../knowledgebase-documents.command'

/** Shared defaults and permission-filtered choices for document upload clients. */
@CommandHandler(GetKnowledgebaseProcessingOptionsCommand)
export class GetKnowledgebaseProcessingOptionsHandler implements ICommandHandler<GetKnowledgebaseProcessingOptionsCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly integrations: IntegrationService
    ) {}

    async execute({ input }: GetKnowledgebaseProcessingOptionsCommand): Promise<KnowledgebaseProcessingOptionsResult> {
        const knowledgebase = await this.knowledgebaseService.findOneByIdString(input.knowledgebaseId, {
            select: { id: true, parserConfig: true }
        })
        const fileType = extname(input.fileName ?? '')
            .slice(1)
            .toLowerCase()
        const configured = knowledgebase.parserConfig
        const defaults = resolveKnowledgeDocumentParserConfig({ type: fileType, parserConfig: configured })
        const defaultProcessor = defaults.transformerType || 'default'
        const processor = input.processor?.trim() || defaultProcessor
        const providers = (await this.knowledgebaseService.getDocumentTransformerStrategies())
            .filter(({ meta }) => meta.name !== 'pdf-visual' || fileType === 'pdf')
            .map(({ meta, integration }) => ({
                name: meta.name,
                label: meta.label,
                ...(integration?.service ? { integrationProvider: integration.service } : {})
            }))
        const selected = providers.find((provider) => provider.name === processor)
        if (!selected)
            throw new BadRequestException(
                t('server-ai:Error.DocumentProcessorUnavailable', {
                    defaultValue: 'The selected document parser is unavailable. Refresh the parser settings.'
                })
            )

        const provider = selected.integrationProvider
        const connections: KnowledgebaseProcessingOptionsResult['integrations'] = []
        if (provider) {
            const result = await this.integrations.findAllInOrganizationOrTenant({
                where: { provider },
                select: { id: true, name: true, provider: true },
                order: { name: 'ASC' }
            })
            for (const item of result.items ?? []) {
                if (item.id && item.provider === provider)
                    connections.push({ id: item.id, name: item.name || item.id, provider })
            }
        }
        const requestedId = input.transformerIntegration?.trim()
        if (requestedId && (!provider || !connections.some((item) => item.id === requestedId))) {
            throw new BadRequestException(
                t('server-ai:Error.DocumentParserIntegrationUnavailable', {
                    defaultValue:
                        'The selected integration is unavailable or does not belong to this parser. Select an available connection.'
                })
            )
        }
        const configuredId = processor === defaultProcessor ? defaults.transformerIntegration : undefined
        const selectedIntegrationId =
            requestedId ||
            connections.find((item) => item.id === configuredId)?.id ||
            (connections.length === 1 ? connections[0].id : undefined)
        const parserConfig =
            processor === defaultProcessor
                ? { ...defaults }
                : resolveKnowledgeDocumentParserConfig({ type: fileType, parserConfig: { transformerType: processor } })
        // Clear stale/default connections when switching parsers, including parsers with no integration.
        delete parserConfig.transformerIntegration
        if (selectedIntegrationId) parserConfig.transformerIntegration = selectedIntegrationId
        return {
            fileType,
            defaultProcessor,
            processor,
            defaultSource:
                configured && 'transformerType' in configured && configured.transformerType
                    ? 'knowledgebase'
                    : 'platform',
            providers,
            integrations: connections,
            integrationRequired: Boolean(provider),
            selectedIntegrationId,
            parserConfig
        }
    }
}
