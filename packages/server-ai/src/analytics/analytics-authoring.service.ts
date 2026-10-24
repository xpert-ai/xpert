import { ForbiddenException, HttpException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { z } from 'zod/v3'
import { Integration } from '@xpert-ai/server-core'
import { XpertToolsetCategoryEnum, type JSONValue } from '@xpert-ai/contracts'
import {
    AnalyticsDefinitionAuthoringCapability,
    AnalyticsProviderRegistry,
    RuntimeCapabilityProvider,
    analyticsOptionsSchema,
    type AnalyticsDefinitionAuthoringApi,
    type AnalyticsAuthoringScope,
    type AnalyticsAuthoringSelection,
    type AnalyticsDefinitionRegistration,
    type AnalyticsAuthoringConnection,
    type AnalyticsAuthoringCandidate,
    type AnalyticsAuthoringContext,
    type AnalyticsQueryProvider
} from '@xpert-ai/plugin-sdk'
import { Xpert } from '../xpert/xpert.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { resolveMcpServerName } from '../xpert-toolset/provider/mcp/server-name'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { AnalyticsDefinitionService } from './analytics-definition.service'
import { definitionError } from './analytics-definition.errors'

const selectionSchema = z
    .object({ providerId: z.string().min(1).max(160), connectionKey: z.string().min(1).max(400) })
    .strict()
const registrationSchema = selectionSchema
    .extend({
        requestId: z.string().min(1).max(128),
        name: z.string().trim().min(1).max(200),
        definition: analyticsOptionsSchema
    })
    .strict()
const mcpSchema = z.object({ servers: z.record(z.unknown()).optional(), mcpServers: z.record(z.unknown()).optional() })
type Candidate = AnalyticsAuthoringCandidate & { connection: AnalyticsAuthoringConnection }

@Injectable()
@RuntimeCapabilityProvider(AnalyticsDefinitionAuthoringCapability)
export class AnalyticsAuthoringService implements AnalyticsDefinitionAuthoringApi {
    constructor(
        private readonly definitions: AnalyticsDefinitionService,
        private readonly providers: AnalyticsProviderRegistry,
        private readonly workspaces: XpertWorkspaceAccessService,
        @InjectRepository(Xpert) private readonly assistants: Repository<Xpert>,
        @InjectRepository(XpertToolset) private readonly toolsets: Repository<XpertToolset>,
        @InjectRepository(Integration) private readonly integrations: Repository<Integration>
    ) {}
    private async authorize(scope: AnalyticsAuthoringScope) {
        const actor = await this.definitions.authorize(scope.actor)
        const identity = z.object({ workspaceId: z.string().uuid(), xpertId: z.string().uuid() }).parse(scope)
        const assistant = await this.assistants.findOneBy({
            id: identity.xpertId,
            workspaceId: identity.workspaceId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId
        })
        if (!assistant) throw definitionError('denied')
        return actor
    }
    private async candidates(scope: AnalyticsAuthoringScope, provider: AnalyticsQueryProvider): Promise<Candidate[]> {
        const config = provider.configuration,
            authoring = provider.authoring
        if (config?.kind !== 'definition' || !authoring) return []
        const base = { providerId: provider.descriptor.id }
        if (config.connection === 'workspace-files')
            return [
                {
                    ...base,
                    connectionKey: 'workspace',
                    name: provider.descriptor.name,
                    connection: { kind: 'workspace-files' }
                }
            ]
        const { tenantId, organizationId } = scope.actor
        if (config.connection === 'integration') {
            if (!authoring.integrationProvider) return []
            const items = await this.integrations.find({
                where: [
                    { tenantId, organizationId, provider: authoring.integrationProvider },
                    { tenantId, organizationId: IsNull(), provider: authoring.integrationProvider }
                ],
                select: ['id', 'name'],
                order: { id: 'ASC' },
                take: 1001
            })
            if (items.length > 1000) throw definitionError('invalid')
            return items.map((item) => ({
                ...base,
                connectionKey: item.id,
                name: item.name,
                connection: { kind: 'integration', integrationId: item.id }
            }))
        }
        // File runtime ACLs are checked by WorkspaceFiles, never by authoring workspace membership.
        await this.workspaces.assertCanRead(scope.workspaceId)
        const items = await this.toolsets.find({
            where: {
                tenantId,
                organizationId,
                workspaceId: scope.workspaceId,
                category:
                    config.connection === 'rest-toolset' ? XpertToolsetCategoryEnum.API : XpertToolsetCategoryEnum.MCP,
                ...(config.connection === 'rest-toolset' ? { type: 'openapi' } : {})
            },
            select: ['id', 'name', 'schema'],
            order: { id: 'ASC' },
            take: 1001
        })
        if (items.length > 1000) throw definitionError('invalid')
        return items.flatMap<Candidate>((item) => {
            if (config.connection === 'rest-toolset')
                return [
                    {
                        ...base,
                        connectionKey: item.id,
                        name: item.name,
                        connection: { kind: 'rest-toolset' as const, toolsetId: item.id }
                    }
                ]
            let parsed: z.output<typeof mcpSchema>
            try {
                parsed = mcpSchema.parse(JSON.parse(item.schema))
            } catch {
                return []
            }
            const serverNames = Object.keys(parsed.servers ?? parsed.mcpServers ?? {}).map((key) =>
                resolveMcpServerName(key, item.name)
            )
            if (new Set(serverNames).size !== serverNames.length) return []
            return serverNames.map((serverName) => ({
                ...base,
                connectionKey: JSON.stringify([item.id, serverName]),
                name: `${item.name} / ${serverName}`,
                connection: { kind: 'mcp-toolset' as const, toolsetId: item.id, serverName }
            }))
        })
    }
    async catalog(scope: AnalyticsAuthoringScope) {
        await this.authorize(scope)
        const result: AnalyticsAuthoringCandidate[] = []
        for (const provider of this.providers.list(scope.actor.organizationId)) {
            // A denied connection catalog must not hide files/other accessible providers.
            try {
                result.push(...(await this.candidates(scope, provider)).map(({ connection, ...item }) => item))
            } catch (error) {
                if (!(error instanceof ForbiddenException)) throw error
            }
        }
        await this.authorize(scope)
        return result
    }
    private async selected(scope: AnalyticsAuthoringScope, selection: AnalyticsAuthoringSelection) {
        await this.authorize(scope)
        const input = selectionSchema.parse(selection)
        const provider = this.providers
            .list(scope.actor.organizationId)
            .find((item) => item.descriptor.id === input.providerId)
        if (!provider?.authoring) throw definitionError('unavailable')
        const candidate = (await this.candidates(scope, provider)).find(
            (item) => item.connectionKey === input.connectionKey
        )
        if (!candidate) throw definitionError('unavailable')
        return { provider, authoring: provider.authoring, candidate }
    }
    private async run<T>(
        scope: AnalyticsAuthoringScope,
        selection: AnalyticsAuthoringSelection,
        action: (
            selected: Awaited<ReturnType<AnalyticsAuthoringService['selected']>>,
            context: AnalyticsAuthoringContext
        ) => Promise<T>
    ) {
        const selected = await this.selected(scope, selection)
        const controller = new AbortController(),
            timer = setTimeout(() => controller.abort(), 30000)
        try {
            const result = await action(selected, {
                ...scope,
                connection: selected.candidate.connection,
                signal: controller.signal,
                deadlineAt: Date.now() + 30000
            })
            controller.signal.throwIfAborted()
            await this.selected(scope, selection)
            if (Buffer.byteLength(JSON.stringify(result)) > 200000) throw definitionError('invalid')
            return result
        } catch (error) {
            if (error instanceof HttpException) throw error
            throw definitionError('invalid')
        } finally {
            clearTimeout(timer)
            controller.abort()
        }
    }
    inspect(scope: AnalyticsAuthoringScope, selection: AnalyticsAuthoringSelection, input: Record<string, JSONValue>) {
        return this.run(scope, selection, async ({ authoring }, context) => ({
            inspectSchema: authoring.inspectSchema,
            definitionSchema: authoring.definitionSchema,
            instructions: authoring.instructions,
            metadata: await authoring.inspect(analyticsOptionsSchema.parse(input), context)
        }))
    }
    async register(scope: AnalyticsAuthoringScope, original: AnalyticsDefinitionRegistration) {
        const input = registrationSchema.parse(original)
        const selection = { providerId: input.providerId, connectionKey: input.connectionKey }
        return this.run(scope, selection, async ({ authoring }, context) => {
            const options = analyticsOptionsSchema.parse(await authoring.prepare(input.definition, context))
            context.signal.throwIfAborted()
            await this.selected(scope, selection)
            const saved = await this.definitions.create(
                { name: input.name, providerId: input.providerId, visibility: 'private', options },
                JSON.stringify([scope.workspaceId, scope.xpertId, input.requestId])
            )
            const source = {
                kind: 'definition' as const,
                definitionId: saved.definition.id,
                versionId: saved.version.id
            }
            return {
                source,
                providerId: input.providerId,
                name: saved.definition.name,
                discoveryRequest: { source, providerId: input.providerId, request: {} }
            }
        })
    }
}
