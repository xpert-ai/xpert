import { parseMcpRuntimeConfiguration } from './mcp-runtime-configuration'
import { McpLegacySessions } from './mcp-legacy-sessions'
import { legacyPublicationContext, startLegacyInvocationAudit } from './mcp-legacy-publication-context'
import { runWithCapturedRequestContext } from '../shared/request-context'

import {
    MCP_TASK_EXTENSION_ID,
    type McpAppCapabilityDescriptor,
    type McpPrincipal,
    type McpPromptCapabilityDescriptor,
    type McpResourceCapabilityDescriptor,
    type McpResourceTemplateCapabilityDescriptor,
    type McpToolCapabilityDescriptor
} from '@xpert-ai/contracts'

import { ConfigService } from '@xpert-ai/server-config'
import {
    BAGGAGE_META_KEY,
    McpServer,
    MissingRequiredClientCapabilityError,
    SERVER_INFO_META_KEY,
    TRACEPARENT_META_KEY,
    TRACESTATE_META_KEY,
    createMcpHandler
} from '@modelcontextprotocol/server'

import type {
    CallToolResult,
    CompleteResult,
    GetPromptResult,
    InputRequiredResult,
    ReadResourceResult,
    ServerContext
} from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import {
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    OnModuleDestroy,
    Optional,
    UnauthorizedException
} from '@nestjs/common'

import type { Request, Response } from 'express'
import { t } from 'i18next'
import { randomBytes, randomUUID } from 'node:crypto'
import { applicationMetrics } from '../metrics/application-metrics'
import { ToolRuntimeService } from '../tool-runtime'
import { applicationTracing } from '../tracing/application-tracing'
import { McpPublication, McpPublicationCapability } from './entities'
import { McpAppBundleService } from './mcp-app-bundle.service'

import { McpAuthenticationService } from './mcp-authentication.service'
import { McpElicitationService, McpInputRequiredError } from './mcp-elicitation.service'
import { McpInvocationAuditService } from './mcp-invocation-audit.service'
import { McpPublicationService } from './mcp-publication.service'
import { mcpPublicationPublicUrl } from './mcp-publication-url'
import { McpRateLimitService } from './mcp-rate-limit.service'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import { McpTaskProtocolError, McpTaskService } from './mcp-task.service'

import { McpSubscriptionService } from './mcp-subscription.service'

import * as protocol from './mcp-runtime-protocol'
import {
    registerTool,
    registerResource,
    registerResourceTemplate,
    registerPrompt,
    registerApp,
    type McpRegistrationRuntime
} from './mcp-runtime-registration'
export {
    authorizedSubscriptionNotifications,
    mcpCapabilityProviderInstructions,
    mcpPublicationInstructions,
    type McpProviderInstruction,
    type TaskSubscriptionNotifications
} from './mcp-runtime-protocol'

@Injectable()
export class McpPublicationRuntimeService implements OnModuleDestroy {
    readonly #logger = new Logger(McpPublicationRuntimeService.name)
    readonly #taskSubscriptionClosers = new Set<() => void>()
    readonly #legacySessions = new McpLegacySessions()

    constructor(
        private readonly publications: McpPublicationService,
        private readonly authentication: McpAuthenticationService,
        private readonly publicationAuthorization: McpPublicationAuthorizationService,
        private readonly rateLimit: McpRateLimitService,
        private readonly audit: McpInvocationAuditService,
        private readonly toolRuntime: ToolRuntimeService,
        private readonly appBundles: McpAppBundleService,
        private readonly elicitation: McpElicitationService,
        private readonly tasks: McpTaskService,
        private readonly subscriptions: McpSubscriptionService,
        @Optional() @Inject(ConfigService) private readonly configService?: ConfigService
    ) {}

    async handle(slug: string, request: Request, response: Response, parsedBody: unknown) {
        const publication = await this.publications.findActiveBySlug(slug)
        const method = protocol.mcpMetricMethod(parsedBody)
        const toolName = protocol.mcpMetricToolName(parsedBody)
        const requestMeta = protocol.mcpRequestMeta(parsedBody)
        const remoteTraceparent =
            protocol.validTraceparent(protocol.readMetaString(requestMeta, TRACEPARENT_META_KEY)) ??
            protocol.validTraceparent(protocol.firstHeader(request.headers.traceparent))
        const traceId = protocol.traceIdFromHeader(remoteTraceparent) ?? randomBytes(16).toString('hex')
        const remoteTracestate = remoteTraceparent
            ? (protocol.validTracestate(protocol.readMetaString(requestMeta, TRACESTATE_META_KEY)) ??
              protocol.validTracestate(protocol.firstHeader(request.headers.tracestate)))
            : undefined
        const remoteBaggage =
            protocol.validBaggage(protocol.readMetaString(requestMeta, BAGGAGE_META_KEY)) ??
            protocol.validBaggage(protocol.firstHeader(request.headers.baggage))
        const traceCarrier = {
            traceparent: remoteTraceparent ?? `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
            ...(remoteTracestate ? { tracestate: remoteTracestate } : {}),
            ...(remoteBaggage ? { baggage: remoteBaggage } : {})
        }
        const requestId =
            protocol.normalizedRequestId(protocol.firstHeader(request.headers['x-request-id'])) ?? randomUUID()
        const startedAt = Date.now()
        let authMethod = protocol.mcpAuthMethodHint(request.headers.authorization)
        let authenticated = false
        let principalType: McpPrincipal['subjectType'] | undefined
        let status = 'error'
        response.setHeader('x-request-id', requestId)
        return applicationTracing.withRemoteContext(traceCarrier, () =>
            applicationTracing.traceAsync(
                'mcp.request',
                {
                    'mcp.method': method,
                    'mcp.publication.id': publication.id,
                    'mcp.publication.slug': publication.slug
                },
                async () => {
                    try {
                        let principal: McpPrincipal
                        try {
                            principal = await applicationTracing.traceAsync(
                                'mcp.auth',
                                {
                                    'mcp.auth.method': authMethod,
                                    'mcp.publication.id': publication.id
                                },
                                () => this.authentication.authenticate(publication, request.headers.authorization)
                            )
                            authenticated = true
                            authMethod = principal.authMethod
                            principalType = principal.subjectType
                        } catch (error) {
                            if (error instanceof UnauthorizedException) {
                                response.setHeader(
                                    'WWW-Authenticate',
                                    await this.authentication.challenge(
                                        publication,
                                        mcpPublicationPublicUrl(
                                            this.configService,
                                            `/.well-known/oauth-protected-resource/api/mcp/p/${encodeURIComponent(slug)}`
                                        )
                                    )
                                )
                            }
                            throw error
                        }
                        const executionUser = await applicationTracing.traceAsync(
                            'mcp.authorize',
                            { 'mcp.publication.id': publication.id },
                            () => this.publicationAuthorization.assertCanRun(publication, principal)
                        )
                        await this.rateLimit.assertWithinLimit(publication, principal)
                        const capabilities = await this.publications.resolveRuntimeCapabilities(publication)
                        const visibleCapabilities = capabilities
                            .filter((capability) => protocol.canExposeCapability(principal, capability))
                            .sort(protocol.compareRuntimeCapabilities)
                        if (
                            await this.handleTaskSubscriptionRequest(
                                publication,
                                principal,
                                visibleCapabilities,
                                request,
                                response,
                                parsedBody
                            )
                        ) {
                            status = 'success'
                            return
                        }
                        if (
                            await this.handleTaskProtocolRequest(publication, principal, request, response, parsedBody)
                        ) {
                            status = 'success'
                            return
                        }
                        const handler = createMcpHandler(
                            () => this.createServer(publication, principal, visibleCapabilities, requestId, traceId),
                            {
                                legacy: 'stateless',
                                responseMode: 'auto',
                                bus: this.subscriptions.bus(publication.id)
                            }
                        )
                        const nodeHandler = toNodeHandler(handler)
                        try {
                            // File/Artifact capabilities read RequestContext. Restore only the user
                            // verified for this call; a service account must not inherit an administrator.
                            await runWithCapturedRequestContext(
                                {
                                    user: executionUser ?? null,
                                    headers: {
                                        'tenant-id': principal.tenantId,
                                        ...(principal.organizationId
                                            ? { 'organization-id': principal.organizationId }
                                            : {}),
                                        'x-request-id': requestId
                                    }
                                },
                                async () => {
                                    const handled = await this.#legacySessions.handle({
                                        request,
                                        response,
                                        body: parsedBody,
                                        createServer: () =>
                                            this.createServer(
                                                publication,
                                                principal,
                                                visibleCapabilities,
                                                requestId,
                                                traceId
                                            ),
                                        ...legacyPublicationContext({
                                            publication,
                                            principal,
                                            capabilities: visibleCapabilities,
                                            authorization: request.headers.authorization,
                                            requestId,
                                            traceId,
                                            publications: this.publications,
                                            authentication: this.authentication,
                                            publicationAuthorization: this.publicationAuthorization
                                        })
                                    })
                                    if (!handled) await nodeHandler(request, response, parsedBody)
                                }
                            )
                            status = response.statusCode >= 400 ? 'error' : 'success'
                        } finally {
                            await handler.close()
                        }
                    } catch (error) {
                        status = protocol.mcpMetricStatus(error)
                        if (!authenticated && error instanceof UnauthorizedException) {
                            applicationMetrics.recordMcpAuthFailure({
                                authMethod,
                                publicationId: publication.id,
                                reason: request.headers.authorization ? 'invalid' : 'missing'
                            })
                        }
                        throw error
                    } finally {
                        const durationMs = Date.now() - startedAt
                        applicationMetrics.recordMcpRequest({
                            authMethod,
                            durationMs,
                            method,
                            publicationId: publication.id,
                            status
                        })
                        this.#logger.log(
                            JSON.stringify({
                                event: 'mcp.request',
                                requestId,
                                traceId,
                                publicationId: publication.id,
                                ...(principalType ? { principalType } : {}),
                                method,
                                ...(toolName ? { toolName } : {}),
                                status,
                                durationMs
                            })
                        )
                    }
                }
            )
        )
    }

    async onModuleDestroy() {
        for (const close of [...this.#taskSubscriptionClosers]) close()
        await this.#legacySessions.close()
    }

    private createServer(
        publication: McpPublication,
        principal: McpPrincipal,
        capabilities: McpPublicationCapability[],
        requestId: string,
        traceId?: string
    ) {
        const registration: McpRegistrationRuntime = {
            appBundles: this.appBundles,
            invokeTool: this.invokeTool.bind(this),
            invokeResource: this.invokeResource.bind(this),
            invokePrompt: this.invokePrompt.bind(this),
            invokeLocalApp: this.invokeLocalApp.bind(this)
        }
        const elicitationCodec = this.elicitation.createCodec(publication, principal)
        const server = new McpServer(protocol.mcpServerInfo(publication), {
            instructions: protocol.mcpPublicationInstructions(
                publication.instructions,
                protocol.mcpCapabilityProviderInstructions(capabilities)
            ),
            cacheHints: {
                'server/discover': { ttlMs: 30_000, cacheScope: 'private' },
                'tools/list': { ttlMs: 30_000, cacheScope: 'private' },
                'prompts/list': { ttlMs: 30_000, cacheScope: 'private' },
                'resources/list': { ttlMs: 30_000, cacheScope: 'private' },
                'resources/templates/list': { ttlMs: 30_000, cacheScope: 'private' },
                'resources/read': { ttlMs: 0, cacheScope: 'private' }
            },
            requestState: { verify: elicitationCodec.verify }
        })
        if (capabilities.some(protocol.isTaskToolCapability)) {
            server.server.registerCapabilities({ extensions: { [MCP_TASK_EXTENSION_ID]: {} } })
        }
        const apps = new Map(
            capabilities.flatMap((capability) =>
                capability.descriptorSnapshot.capabilityType === 'app'
                    ? [[protocol.appBindingKey(capability), capability] as const]
                    : []
            )
        )
        for (const capability of capabilities) {
            const descriptor = capability.descriptorSnapshot
            switch (descriptor.capabilityType) {
                case 'tool':
                    registerTool(
                        registration,
                        server,
                        publication,
                        principal,
                        capability,
                        descriptor,
                        apps,
                        capabilities,
                        elicitationCodec,
                        requestId,
                        traceId
                    )
                    break
                case 'resource':
                    registerResource(registration, server, publication, principal, capability, descriptor, traceId)
                    break
                case 'resource_template':
                    registerResourceTemplate(
                        registration,
                        server,
                        publication,
                        principal,
                        capability,
                        descriptor,
                        traceId
                    )
                    break
                case 'prompt':
                    registerPrompt(registration, server, publication, principal, capability, descriptor, traceId)
                    break
                case 'app':
                    registerApp(registration, server, publication, principal, capability, descriptor, traceId)
                    break
            }
        }
        if (capabilities.some(protocol.supportsCompletion)) {
            server.server.registerCapabilities({ completions: {} })
            server.server.setRequestHandler('completion/complete', async (request) => {
                const params = protocol.completeParams(request.params)
                return params
                    ? this.invokeCompletion(publication, principal, capabilities, params, traceId)
                    : { completion: { values: [], hasMore: false } }
            })
        }
        return server
    }

    private async invokeTool(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpToolCapabilityDescriptor,
        args: unknown,
        context: ServerContext,
        capabilities: McpPublicationCapability[],
        elicitationCodec: ReturnType<McpElicitationService['createCodec']>,
        requestId: string,
        traceId?: string,
        appMeta?: { ui: { resourceUri: string } }
    ): Promise<CallToolResult | InputRequiredResult> {
        const legacy = this.#legacySessions.current()
        await legacy?.revalidate()
        context.mcpReq.signal.throwIfAborted()
        requestId = legacy?.requestId ?? requestId
        traceId = legacy?.traceId ?? traceId
        const startedAt = Date.now()
        let status = 'error'
        try {
            const result = await applicationTracing.traceAsync(
                'mcp.tool.call',
                {
                    'mcp.publication.id': publication.id,
                    'mcp.tool.name': capability.publicName,
                    'mcp.toolset.id': capability.toolsetId
                },
                () =>
                    this.invokeToolCore(
                        publication,
                        principal,
                        capability,
                        descriptor,
                        args,
                        context,
                        capabilities,
                        elicitationCodec,
                        requestId,
                        traceId,
                        appMeta
                    )
            )
            status = result.resultType === 'input_required' ? 'input_required' : 'success'
            return result
        } catch (error) {
            status = protocol.mcpMetricStatus(error)
            throw error
        } finally {
            applicationMetrics.recordMcpToolCall({
                authMethod: principal.authMethod,
                durationMs: Date.now() - startedAt,
                publicationId: publication.id,
                status,
                toolName: capability.publicName
            })
        }
    }

    private async invokeToolCore(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpToolCapabilityDescriptor,
        args: unknown,
        context: ServerContext,
        capabilities: McpPublicationCapability[],
        elicitationCodec: ReturnType<McpElicitationService['createCodec']>,
        requestId: string,
        traceId?: string,
        appMeta?: { ui: { resourceUri: string } }
    ): Promise<CallToolResult | InputRequiredResult> {
        protocol.assertSerializedSize(args, protocol.MAX_TOOL_ARGUMENT_BYTES, 'MCP Tool arguments')
        const startedAt = Date.now()
        const audit = await startLegacyInvocationAudit(this.#legacySessions.current(), this.audit, {
            publication,
            principal,
            capability,
            requestId,
            traceId,
            arguments: args
        })
        try {
            const approvalMode = protocol.assertInvocationAllowed(principal, capability, descriptor)
            await this.rateLimit.assertWithinLimit(publication, principal, capability)
            const elicitation = await this.elicitation.prepare({
                publication,
                principal,
                capability,
                descriptor,
                arguments: args,
                context,
                codec: elicitationCodec
            })
            if (approvalMode === 'confirm') {
                const approval = await elicitation.input.request({
                    type: 'form',
                    title: t('server-ai:Error.McpToolApprovalPrompt', {
                        defaultValue: `Approve MCP tool '${capability.publicName}'`,
                        name: capability.publicName
                    }),
                    schema: {
                        type: 'object',
                        properties: { approved: { type: 'boolean' } },
                        required: ['approved'],
                        additionalProperties: false
                    }
                })
                if (!protocol.isToolApprovalGranted(approval)) {
                    throw new ForbiddenException(
                        t('server-ai:Error.McpToolApprovalRequired', {
                            defaultValue: `Tool '${capability.publicName}' is denied or requires interactive approval.`,
                            name: capability.publicName
                        })
                    )
                }
            }
            if (descriptor.taskMode) {
                if (!protocol.supportsTaskExtension(context)) {
                    if (descriptor.taskMode === 'required') {
                        throw new MissingRequiredClientCapabilityError({
                            requiredCapabilities: {
                                extensions: { [MCP_TASK_EXTENSION_ID]: {} }
                            }
                        })
                    }
                } else {
                    const task = await this.tasks.create({
                        publication,
                        principal,
                        capability,
                        arguments: args,
                        requestId,
                        rpcRequestId: context.mcpReq.id,
                        executionId: elicitation.executionId,
                        traceId,
                        appResourceUri: appMeta?.ui.resourceUri,
                        approvalGranted: approvalMode === 'confirm',
                        maxLifetimeMs: descriptor.taskMaxLifetimeMs
                    })
                    await this.audit.succeeded(audit, startedAt)
                    return task
                }
            }
            const result = await this.toolRuntime.executeTool({
                source: 'mcp',
                mcpRuntime: parseMcpRuntimeConfiguration(publication.runtime),
                principal: {
                    type: principal.subjectType,
                    id: principal.subjectId,
                    userId: principal.userId,
                    clientId: principal.clientId
                },
                tenantId: publication.tenantId,
                organizationId: principal.organizationId ?? publication.organizationId ?? null,
                toolsetId: capability.toolsetId,
                toolName: capability.capabilityKey,
                serverName: descriptor.source.serverName,
                remoteName: descriptor.source.remoteName,
                remoteTaskMode: descriptor.taskMode,
                arguments: args,
                executionId: elicitation.executionId,
                requestId,
                traceId,
                signal: capability.policy?.timeoutMs ? AbortSignal.timeout(capability.policy.timeoutMs) : undefined,
                host: {
                    input: elicitation.input,
                    events: this.subscriptions.eventsApi(publication.id, capabilities)
                }
            })
            await this.audit.succeeded(audit, startedAt)
            return protocol.toMcpCallToolResult(result, appMeta)
        } catch (error) {
            if (error instanceof McpInputRequiredError) {
                await this.audit.succeeded(audit, startedAt)
                return error.result
            }
            await this.audit.failed(audit, startedAt, error)
            throw error
        }
    }

    private async handleTaskProtocolRequest(
        publication: McpPublication,
        principal: McpPrincipal,
        request: Request,
        response: Response,
        body: unknown
    ) {
        const method = protocol.taskProtocolMethod(body)
        if (!method) return false
        const id = protocol.jsonRpcId(body)
        try {
            protocol.assertModernTaskExtensionRequest(request, body)
            const params = protocol.taskProtocolParams(body)
            if (!params) throw protocol.invalidTaskProtocolRequest()
            protocol.assertTaskRoutingHeaders(request, method, params.taskId)
            const result =
                method === 'tasks/get'
                    ? await this.tasks.get(publication, principal, params.taskId)
                    : method === 'tasks/update'
                      ? await this.tasks.update(publication, principal, params.taskId, params.inputResponses)
                      : await this.tasks.cancel(publication, principal, params.taskId)
            response.status(200).json({
                jsonrpc: '2.0',
                id,
                result: protocol.withMcpServerInfo(result, publication)
            })
        } catch (error) {
            const protocolError =
                error instanceof McpTaskProtocolError
                    ? error
                    : new McpTaskProtocolError(
                          -32603,
                          t('server-ai:Error.McpTaskRequestFailed', {
                              defaultValue: 'The MCP task request failed.'
                          })
                      )
            response.status(200).json({
                jsonrpc: '2.0',
                id,
                error: {
                    code: protocolError.code,
                    message: protocolError.message,
                    ...(protocolError.data === undefined ? {} : { data: protocolError.data })
                }
            })
        }
        return true
    }

    private async handleTaskSubscriptionRequest(
        publication: McpPublication,
        principal: McpPrincipal,
        capabilities: McpPublicationCapability[],
        request: Request,
        response: Response,
        body: unknown
    ) {
        const subscription = protocol.taskSubscriptionRequest(body)
        if (!subscription) return false
        if (!subscription.valid) {
            protocol.writeTaskProtocolError(response, subscription.id, protocol.invalidTaskProtocolRequest())
            return true
        }
        try {
            protocol.assertModernTaskExtensionRequest(request, body)
        } catch (error) {
            protocol.writeTaskProtocolError(
                response,
                subscription.id,
                error instanceof McpTaskProtocolError ? error : protocol.invalidTaskProtocolRequest()
            )
            return true
        }
        if (protocol.firstHeader(request.headers['mcp-method']) !== 'subscriptions/listen') {
            protocol.writeTaskProtocolError(response, subscription.id, protocol.invalidTaskProtocolRequest())
            return true
        }
        if (this.#taskSubscriptionClosers.size >= 256) {
            protocol.writeTaskProtocolError(
                response,
                subscription.id,
                new McpTaskProtocolError(-32603, 'Subscription limit reached')
            )
            return true
        }
        try {
            await Promise.all(subscription.taskIds.map((taskId) => this.tasks.get(publication, principal, taskId)))
        } catch (error) {
            protocol.writeTaskProtocolError(
                response,
                subscription.id,
                error instanceof McpTaskProtocolError ? error : protocol.invalidTaskProtocolRequest()
            )
            return true
        }
        const notifications = protocol.authorizedSubscriptionNotifications(subscription.notifications, capabilities)

        response.status(200)
        response.setHeader('Content-Type', 'text/event-stream')
        response.setHeader('Cache-Control', 'no-cache, no-store')
        response.setHeader('Connection', 'keep-alive')
        response.flushHeaders?.()
        const subscriptionMeta = { 'io.modelcontextprotocol/subscriptionId': subscription.id }
        protocol.writeSseMessage(response, {
            jsonrpc: '2.0',
            method: 'notifications/subscriptions/acknowledged',
            params: {
                _meta: subscriptionMeta,
                notifications
            }
        })

        let closed = false
        let resolveClosed = () => undefined
        const closedPromise = new Promise<void>((resolve) => {
            resolveClosed = resolve
        })
        let unsubscribeCore = () => undefined
        let unsubscribeTasks = () => undefined
        let unsubscribeAccessInvalidations = () => undefined
        let keepAlive: ReturnType<typeof setInterval> | undefined
        let maxLifetime: ReturnType<typeof setTimeout> | undefined
        const close = (graceful = true) => {
            if (closed) return
            closed = true
            if (keepAlive) clearInterval(keepAlive)
            if (maxLifetime) clearTimeout(maxLifetime)
            unsubscribeCore()
            unsubscribeTasks()
            unsubscribeAccessInvalidations()
            this.#taskSubscriptionClosers.delete(close)
            if (graceful && !response.writableEnded) {
                protocol.writeSseMessage(response, {
                    jsonrpc: '2.0',
                    id: subscription.id,
                    result: {
                        resultType: 'complete',
                        _meta: {
                            ...subscriptionMeta,
                            [SERVER_INFO_META_KEY]: protocol.mcpServerInfo(publication)
                        }
                    }
                })
                response.end()
            }
            resolveClosed()
        }
        let pendingAccessCheck: Promise<McpPrincipal> | undefined
        const assertAccess = () => {
            if (!pendingAccessCheck) {
                pendingAccessCheck = this.assertSubscriptionAccess(
                    publication,
                    principal,
                    request.headers.authorization
                ).finally(() => {
                    pendingAccessCheck = undefined
                })
            }
            return pendingAccessCheck
        }
        const taskIds = new Set(subscription.taskIds)
        unsubscribeCore = this.subscriptions.bus(publication.id).subscribe((event) => {
            const notification = protocol.coreSubscriptionNotification(event, notifications, subscriptionMeta)
            if (!notification || closed) return
            void assertAccess()
                .then(() => {
                    if (!closed) protocol.writeSseMessage(response, notification)
                })
                .catch(() => close(true))
        })
        unsubscribeTasks = this.subscriptions.subscribeTasks(publication.id, (taskId) => {
            if (!taskIds.has(taskId) || closed) return
            void assertAccess()
                .then((currentPrincipal) => this.tasks.get(publication, currentPrincipal, taskId))
                .then((task) => {
                    if (!closed)
                        protocol.writeSseMessage(response, protocol.taskStatusNotification(task, subscriptionMeta))
                })
                .catch(() => close(true))
        })
        keepAlive = setInterval(() => {
            if (closed) return
            void assertAccess()
                .then(() => {
                    if (!closed) response.write(': keepalive\n\n')
                })
                .catch(() => close(true))
        }, 15_000)
        keepAlive.unref?.()
        maxLifetime = setTimeout(() => close(true), 10 * 60 * 1000)
        maxLifetime.unref?.()
        unsubscribeAccessInvalidations = this.subscriptions.subscribeAccessInvalidations(publication.id, () =>
            close(true)
        )
        this.#taskSubscriptionClosers.add(close)
        response.once('close', () => close(false))
        response.once('error', () => close(false))
        await closedPromise
        return true
    }

    private async assertSubscriptionAccess(
        publication: McpPublication,
        principal: McpPrincipal,
        authorization?: string
    ) {
        const current = await this.authentication.authenticate(publication, authorization)
        if (current.subjectType !== principal.subjectType || current.subjectId !== principal.subjectId) {
            throw new UnauthorizedException()
        }
        await this.publicationAuthorization.assertCanRun(publication, current)
        return current
    }

    private async invokeResource(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor:
            | McpResourceCapabilityDescriptor
            | McpResourceTemplateCapabilityDescriptor
            | McpAppCapabilityDescriptor,
        uri: string,
        arguments_: Record<string, string>,
        traceId?: string
    ): Promise<ReadResourceResult> {
        traceId = this.#legacySessions.current()?.traceId ?? traceId
        protocol.assertAllowedResourceUri(uri)
        const requestId = randomUUID()
        const startedAt = Date.now()
        const audit = await this.audit.start({
            publication,
            principal,
            capability,
            requestId,
            traceId,
            arguments: { uri, argumentNames: Object.keys(arguments_) }
        })
        try {
            await this.rateLimit.assertWithinLimit(publication, principal, capability)
            const result = await this.toolRuntime.executeMcpResource({
                source: 'mcp',
                mcpRuntime: parseMcpRuntimeConfiguration(publication.runtime),
                principal: protocol.toToolPrincipal(principal),
                tenantId: publication.tenantId,
                organizationId: principal.organizationId ?? publication.organizationId ?? null,
                toolsetId: capability.toolsetId,
                capabilityKey: capability.capabilityKey,
                capabilityType: descriptor.capabilityType,
                serverName: descriptor.source.serverName,
                remoteName: descriptor.source.remoteName,
                uri,
                arguments: arguments_,
                executionId: randomUUID(),
                requestId,
                traceId,
                signal: protocol.timeoutSignal(capability)
            })
            const response = protocol.toMcpReadResourceResult(
                result,
                uri,
                descriptor.capabilityType === 'resource'
                    ? descriptor.mimeType
                    : descriptor.capabilityType === 'app'
                      ? 'text/html;profile=mcp-app'
                      : undefined
            )
            await this.audit.succeeded(audit, startedAt)
            return response
        } catch (error) {
            await this.audit.failed(audit, startedAt, error)
            throw error
        }
    }

    private async invokeLocalApp(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpAppCapabilityDescriptor,
        uri: string,
        traceId?: string
    ): Promise<ReadResourceResult> {
        traceId = this.#legacySessions.current()?.traceId ?? traceId
        protocol.assertAllowedResourceUri(uri)
        const requestId = randomUUID()
        const startedAt = Date.now()
        const audit = await this.audit.start({
            publication,
            principal,
            capability,
            requestId,
            traceId,
            arguments: { uri }
        })
        try {
            await this.rateLimit.assertWithinLimit(publication, principal, capability)
            const content = await this.appBundles.read(publication, descriptor)
            await this.audit.succeeded(audit, startedAt)
            return { contents: [content] }
        } catch (error) {
            await this.audit.failed(audit, startedAt, error)
            throw error
        }
    }

    private async invokePrompt(
        publication: McpPublication,
        principal: McpPrincipal,
        capability: McpPublicationCapability,
        descriptor: McpPromptCapabilityDescriptor,
        arguments_: Record<string, string>,
        traceId?: string
    ): Promise<GetPromptResult> {
        traceId = this.#legacySessions.current()?.traceId ?? traceId
        const requestId = randomUUID()
        const startedAt = Date.now()
        const audit = await this.audit.start({
            publication,
            principal,
            capability,
            requestId,
            traceId,
            arguments: { argumentNames: Object.keys(arguments_) }
        })
        try {
            await this.rateLimit.assertWithinLimit(publication, principal, capability)
            const result = await this.toolRuntime.executeMcpPrompt({
                source: 'mcp',
                mcpRuntime: parseMcpRuntimeConfiguration(publication.runtime),
                principal: protocol.toToolPrincipal(principal),
                tenantId: publication.tenantId,
                organizationId: principal.organizationId ?? publication.organizationId ?? null,
                toolsetId: capability.toolsetId,
                capabilityKey: capability.capabilityKey,
                serverName: descriptor.source.serverName,
                remoteName: descriptor.source.remoteName,
                name: descriptor.source.remoteName ?? descriptor.name,
                arguments: arguments_,
                executionId: randomUUID(),
                requestId,
                traceId,
                signal: protocol.timeoutSignal(capability)
            })
            const response = protocol.toMcpPromptResult(result)
            await this.audit.succeeded(audit, startedAt)
            return response
        } catch (error) {
            await this.audit.failed(audit, startedAt, error)
            throw error
        }
    }

    private async invokeCompletion(
        publication: McpPublication,
        principal: McpPrincipal,
        capabilities: McpPublicationCapability[],
        params: {
            ref: { type: 'ref/resource'; uri: string } | { type: 'ref/prompt'; name: string }
            argument: { name: string; value: string }
            context?: { arguments?: Record<string, string> }
        },
        traceId?: string
    ): Promise<CompleteResult> {
        traceId = this.#legacySessions.current()?.traceId ?? traceId
        if (params.ref.type === 'ref/resource') protocol.assertAllowedResourceUri(params.ref.uri)
        const capability = capabilities.find((item) => protocol.completionMatches(item, params.ref))
        if (
            !capability ||
            !protocol.supportsCompletion(capability) ||
            !protocol.hasScope(principal, 'completion:complete', capability.publicName)
        ) {
            return { completion: { values: [], hasMore: false } }
        }
        const requestId = randomUUID()
        const startedAt = Date.now()
        const audit = await this.audit.start({
            publication,
            principal,
            capability,
            requestId,
            traceId,
            arguments: {
                referenceType: params.ref.type === 'ref/resource' ? 'resource' : 'prompt',
                argumentName: params.argument.name,
                contextArgumentNames: Object.keys(params.context?.arguments ?? {})
            }
        })
        try {
            await this.rateLimit.assertWithinLimit(publication, principal, capability)
            const result = await this.toolRuntime.completeMcpCapability({
                source: 'mcp',
                mcpRuntime: parseMcpRuntimeConfiguration(publication.runtime),
                principal: protocol.toToolPrincipal(principal),
                tenantId: publication.tenantId,
                organizationId: principal.organizationId ?? publication.organizationId ?? null,
                toolsetId: capability.toolsetId,
                capabilityKey: capability.capabilityKey,
                serverName: capability.descriptorSnapshot.source.serverName,
                remoteName: capability.descriptorSnapshot.source.remoteName,
                reference:
                    params.ref.type === 'ref/resource'
                        ? { type: 'resource', value: params.ref.uri }
                        : {
                              type: 'prompt',
                              value: capability.descriptorSnapshot.source.remoteName ?? capability.capabilityKey
                          },
                argument: params.argument,
                arguments: params.context?.arguments,
                executionId: randomUUID(),
                requestId,
                traceId,
                signal: AbortSignal.timeout(Math.min(capability.policy?.timeoutMs ?? 1_500, 1_500))
            })
            const values = [...new Set(result.values.filter((value) => typeof value === 'string'))].slice(0, 50)
            const response: CompleteResult = {
                completion: {
                    values,
                    ...(result.total !== undefined ? { total: Math.max(values.length, result.total) } : {}),
                    hasMore: result.hasMore === true || result.values.length > values.length
                }
            }
            protocol.assertSerializedSize(response, protocol.MAX_COMPLETION_RESULT_BYTES, 'MCP Completion result')
            await this.audit.succeeded(audit, startedAt)
            return response
        } catch (error) {
            await this.audit.failed(audit, startedAt, error)
            throw error
        }
    }
}
