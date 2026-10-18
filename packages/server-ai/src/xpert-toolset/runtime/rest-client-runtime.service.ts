// Invariants: the host owns connection identity and authentication. Revalidate viewer grants and
// stored definitions before and after HTTP; neither a pinned schema nor a saved Binding grants access.
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { t } from 'i18next'
import { XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import {
    RequestContext,
    RestClientRuntimeCapability,
    RuntimeCapabilityProvider,
    type RestClientRuntimeApi,
    type RestClientScope,
    type RestOperationCall
} from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertToolset } from '../xpert-toolset.entity'
import {
    boundedJson,
    operationCatalog,
    requestSchema,
    scopeSchema,
    serializeRequest,
    validateArguments
} from './rest-client.schema'
import { RestClientTransport } from './rest-client.transport'

const safeErrors = new Set([
    'REST_CLIENT_SIZE_LIMIT',
    'REST_CLIENT_OPERATION_CHANGED',
    'REST_CLIENT_ARGUMENTS_INVALID',
    'REST_CLIENT_CONNECTION_CHANGED',
    'REST_CLIENT_TIMEOUT',
    'REST_CLIENT_HTTP_ERROR',
    'REST_CLIENT_JSON_REQUIRED',
    'REST_CLIENT_AUTH_INVALID',
    'REST_CLIENT_ENDPOINT_INVALID',
    'REST_CLIENT_AMBIGUOUS_OPERATIONS'
])

@Injectable()
@RuntimeCapabilityProvider(RestClientRuntimeCapability)
export class RestClientRuntimeService implements RestClientRuntimeApi {
    readonly operations: RestClientRuntimeApi['operations'] = Object.freeze({
        list: (scope: RestClientScope) =>
            this.guard(scope, async (current) => operationCatalog(current).map((op) => op.descriptor)),
        call: (scope: RestClientScope, input: RestOperationCall) =>
            this.guard(scope, async (current, signal, check) => {
                boundedJson(input, 64000)
                const request = requestSchema.parse(input)
                const operation = operationCatalog(current).find(
                    (op) => op.descriptor.operationId === request.operationId
                )
                if (!operation || operation.descriptor.contractHash !== request.contractHash)
                    throw new Error('REST_CLIENT_OPERATION_CHANGED')
                validateArguments(operation, request.arguments)
                const prepared = serializeRequest(operation, request.arguments)
                await check()
                const remaining = Math.min(30000, scope.deadlineAt - Date.now())
                if (remaining <= 0) throw new Error('REST_CLIENT_TIMEOUT')
                return this.transport.request(prepared, current.credentials, signal, remaining)
            })
    })

    constructor(
        @InjectRepository(XpertToolset) private readonly toolsets: Repository<XpertToolset>,
        private readonly workspaces: XpertWorkspaceAccessService,
        private readonly transport: RestClientTransport
    ) {}

    private async authorize(scope: RestClientScope) {
        if (
            scope.actor.tenantId !== RequestContext.currentTenantId() ||
            scope.actor.organizationId !== RequestContext.getOrganizationId() ||
            scope.actor.userId !== RequestContext.currentUserId()
        )
            throw new ForbiddenException(
                t('server-ai:Error.RestClientAccessDenied', { defaultValue: 'REST connection access denied.' })
            )
        await this.workspaces.assertCanRead(scope.workspaceId)
        const connection = await this.toolsets.findOne({
            where: {
                id: scope.toolsetId,
                tenantId: scope.actor.tenantId,
                organizationId: scope.actor.organizationId,
                workspaceId: scope.workspaceId,
                category: XpertToolsetCategoryEnum.API,
                type: 'openapi'
            },
            relations: ['tools']
        })
        if (!connection)
            throw new ForbiddenException(
                t('server-ai:Error.RestClientAccessDenied', { defaultValue: 'REST connection access denied.' })
            )
        return connection
    }

    private async guard<T>(
        original: RestClientScope,
        action: (connection: XpertToolset, signal: AbortSignal, check: () => Promise<void>) => Promise<T>
    ): Promise<T> {
        const { signal, ...input } = original
        const scope = { ...scopeSchema.parse(input), signal }
        const controller = new AbortController(),
            abort = () => controller.abort()
        signal.throwIfAborted()
        signal.addEventListener('abort', abort, { once: true })
        const timeout = Math.min(30000, scope.deadlineAt - Date.now())
        const timer = setTimeout(abort, Math.max(0, timeout))
        try {
            if (timeout <= 0) throw new Error('REST_CLIENT_TIMEOUT')
            const connection = await this.authorize(scope)
            const version = connectionVersion(connection)
            const check = async () => {
                controller.signal.throwIfAborted()
                if (version !== connectionVersion(await this.authorize(scope)))
                    throw new Error('REST_CLIENT_CONNECTION_CHANGED')
                controller.signal.throwIfAborted()
            }
            await check()
            const result = await action(connection, controller.signal, check)
            await check()
            return result
        } catch (error) {
            if (error instanceof ForbiddenException) throw error
            const code = controller.signal.aborted
                ? 'REST_CLIENT_TIMEOUT'
                : error instanceof Error && safeErrors.has(error.message)
                  ? error.message
                  : 'REST_CLIENT_UNAVAILABLE'
            throw new BadRequestException({
                code,
                message: t('server-ai:Error.RestClientUnavailable', {
                    defaultValue: 'The REST operation is unavailable, changed, or returned an invalid result.'
                })
            })
        } finally {
            clearTimeout(timer)
            signal.removeEventListener('abort', abort)
            controller.abort()
        }
    }
}

function connectionVersion(connection: XpertToolset) {
    return JSON.stringify({
        updatedAt: connection.updatedAt,
        options: connection.options,
        credentials: connection.credentials,
        tools: connection.tools
            ?.map((tool) => ({
                id: tool.id,
                name: tool.name,
                updatedAt: tool.updatedAt,
                enabled: tool.enabled,
                disabled: tool.disabled,
                options: tool.options
            }))
            .sort((a, b) => a.id.localeCompare(b.id))
    })
}
