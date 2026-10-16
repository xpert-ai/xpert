// Connection values belong to the bound toolset, never the Publication or its view manifest.
// Only the owning management scope may edit them; secret placeholders retain existing values.
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
    RolesEnum,
    XpertToolsetCategoryEnum,
    type JsonSchemaObjectType,
    type McpPublicationConfigurationTab,
    type McpPublicationPluginSource
} from '@xpert-ai/contracts'
import { GLOBAL_ORGANIZATION_SCOPE, RequestContext, ToolsetRegistry, type IToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { In, IsNull, Repository } from 'typeorm'
import Ajv from 'ajv'
import { t } from 'i18next'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { McpPublicationService } from '../mcp-publication.service'
import { McpPublication } from '../entities'
import { UpdateMcpSourceConfigurationInput } from './configuration.dto'
import { maskConfiguration, restoreConfigurationSecrets } from './configuration-values'

@Injectable()
export class McpSourceConfigurationService {
    constructor(
        private readonly publications: McpPublicationService,
        @InjectRepository(XpertToolset) private readonly toolsets: Repository<XpertToolset>,
        private readonly registry: ToolsetRegistry,
        private readonly workspaceAccess: XpertWorkspaceAccessService
    ) {}

    async sources(publicationId: string): Promise<McpPublicationPluginSource[]> {
        const { sources } = await this.boundSources(publicationId)
        return sources.map(({ source }) => source)
    }

    async tabs(publicationId: string): Promise<McpPublicationConfigurationTab[]> {
        const { publication, sources } = await this.boundSources(publicationId)
        return sources.flatMap(({ source, strategy }) => {
            const schema: JsonSchemaObjectType | undefined = strategy.meta.configSchema
            if (!schema || !Object.keys(schema.properties ?? {}).length) return []
            return [
                { ...source, schema, title: schema.title ?? strategy.meta.label, canEdit: this.ownsScope(publication) }
            ]
        })
    }

    async get(publicationId: string, toolsetId: string) {
        const { toolset, schema } = await this.configurableSource(publicationId, toolsetId)
        return {
            values: maskConfiguration(schema, toolset.credentials ?? {}),
            revision: toolset.updatedAt.toISOString()
        }
    }

    async update(publicationId: string, toolsetId: string, input: UpdateMcpSourceConfigurationInput) {
        const { toolset, schema, strategy } = await this.configurableSource(publicationId, toolsetId)
        if (input.revision !== toolset.updatedAt.toISOString()) throw this.conflict()
        const values = restoreConfigurationSecrets(schema, input.values, toolset.credentials ?? {})
        // Localized annotation titles are supported by platform schemas; validate actual values with Ajv.
        const validate = new Ajv({ strict: false, validateSchema: false, ownProperties: true }).compile({
            ...schema,
            additionalProperties: schema.additionalProperties ?? false
        })
        if (Object.keys(input.values).some((key) => !Object.hasOwn(schema.properties, key)) || !validate(values)) {
            throw new BadRequestException(t('server-ai:Error.McpSourceConfigurationInvalid'))
        }
        await strategy.validateConfig(values)
        // Lock and compare in JS: database timestamps may have finer precision than Date.
        await this.toolsets.manager.transaction(async (manager) => {
            const where = {
                id: toolset.id,
                tenantId: toolset.tenantId,
                organizationId: toolset.organizationId ?? IsNull()
            }
            const current = await manager.findOne(XpertToolset, {
                where,
                // Eager tag joins cannot be locked on PostgreSQL; only the connection row is needed.
                loadEagerRelations: false,
                lock: { mode: 'pessimistic_write' }
            })
            if (!current || current.updatedAt.toISOString() !== input.revision) throw this.conflict()
            await manager.update(XpertToolset, where, { credentials: { ...current.credentials, ...values } })
        })
        return this.get(publicationId, toolsetId)
    }

    private async configurableSource(publicationId: string, toolsetId: string) {
        const { publication, sources } = await this.boundSources(publicationId)
        if (!this.ownsScope(publication))
            throw new ForbiddenException(t('server-ai:Error.McpSourceConfigurationOwnerScope'))
        const match = sources.find(({ source }) => source.toolsetId === toolsetId)
        const schema: JsonSchemaObjectType | undefined = match?.strategy.meta.configSchema
        if (!match || !schema || !Object.keys(schema.properties ?? {}).length) {
            throw new NotFoundException(t('server-ai:Error.McpSourceConfigurationNotFound'))
        }
        if (match.toolset.workspaceId) await this.workspaceAccess.assertCanWrite(match.toolset.workspaceId)
        return { ...match, schema }
    }

    private async boundSources(publicationId: string) {
        if (!RequestContext.hasRole(RolesEnum.SUPER_ADMIN)) throw new ForbiddenException()
        const publication = await this.publications.getManaged(publicationId, ['capabilities'])
        const ids = [...new Set(publication.capabilities.map(({ toolsetId }) => toolsetId))]
        const toolsets = ids.length
            ? await this.toolsets.find({
                  where: {
                      id: In(ids),
                      tenantId: publication.tenantId,
                      organizationId: publication.organizationId ?? IsNull(),
                      category: XpertToolsetCategoryEnum.BUILTIN
                  },
                  order: { id: 'ASC' }
              })
            : []
        const strategies = new Map(
            this.registry
                .list(publication.organizationId ?? GLOBAL_ORGANIZATION_SCOPE)
                .map((strategy) => [strategy.meta.name, strategy])
        )
        const sources: Array<{
            source: McpPublicationPluginSource
            toolset: XpertToolset
            strategy: IToolsetStrategy
        }> = []
        for (const toolset of toolsets) {
            const strategy = strategies.get(toolset.type)
            if (!strategy) continue
            const provenance = this.registry.getSource(strategy)
            if (provenance.kind !== 'plugin') continue
            sources.push({
                toolset,
                strategy,
                source: {
                    toolsetId: toolset.id,
                    name: toolset.name,
                    provider: toolset.type,
                    pluginName: provenance.pluginName
                }
            })
        }
        return { publication, sources }
    }

    private ownsScope(publication: McpPublication) {
        return (publication.organizationId ?? null) === (RequestContext.getOrganizationId() ?? null)
    }

    private conflict() {
        return new ConflictException(t('server-ai:Error.McpSourceConfigurationChanged'))
    }
}
