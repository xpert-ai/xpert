import { Injectable } from '@nestjs/common'
import { AsyncCaller } from '@langchain/core/utils/async_caller'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelExecutionModel, ModelExecutionProtocol } from '@xpert-ai/contracts'
import type { Response } from 'express'
import { executeGatewayChat } from '../model-gateway/chat-execution'
import type { GatewayChatWriter } from '../model-gateway/chat-writer'
import { assertRequestCapabilities, type OpenAIChatRequest } from '../model-gateway/openai-adapter'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/middleware-runtime.service'
import { runWithCapturedRequestContext } from '../shared/request-context'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ModelExecutionAdmissionService } from './execution-admission.service'
import { executionError } from './execution-errors'
import { ModelExecutionGrantService } from './execution-grant.service'
import { ModelExecutionMeteringService } from './execution-metering.service'
import type { ModelGatewayCall } from '../model-gateway/model-gateway-call.entity'

@Injectable()
export class ModelExecutionChatService {
    constructor(
        private readonly grants: ModelExecutionGrantService,
        private readonly admission: ModelExecutionAdmissionService,
        private readonly assistants: AssistantExecutionPolicyService,
        private readonly runtime: AgentMiddlewareRuntimeService,
        private readonly metering: ModelExecutionMeteringService
    ) {}
    async execute(input: {
        identity: Awaited<ReturnType<ModelExecutionGrantService['authenticate']>>
        model: ModelExecutionModel
        protocol: ModelExecutionProtocol
        parsed: OpenAIChatRequest
        bodyBytes: number
        response: Response
        abort: AbortController
        writer?: GatewayChatWriter
    }) {
        const { identity, model, protocol, parsed, bodyBytes, response, abort, writer } = input
        const { grant } = identity
        const outputLimit = parsed.options.max_tokens ?? grant.limits.maxOutputTokens
        if (!Number.isSafeInteger(outputLimit) || outputLimit <= 0 || outputLimit > grant.limits.maxOutputTokens)
            throw executionError('OutputLimit')
        if (bodyBytes > grant.limits.maxInputTokens) throw executionError('InputLimit')
        parsed.options.max_tokens = outputLimit
        await runWithCapturedRequestContext(identity.snapshot, async () => {
            const resolution = await this.assistants.authorize(identity.actor, grant.context.xpertId, model)
            let call: ModelGatewayCall
            await executeGatewayChat({
                response,
                writer,
                parsed,
                signal: abort.signal,
                lifecycle: {
                    capabilities: model.capabilities,
                    begin: async () => (call = await this.admission.begin(grant, model, outputLimit)),
                    beforeDispatch: async () => {
                        const fresh = (await this.grants.revalidate(grant)).models.find((item) => item.id === model.id)
                        if (!fresh || !fresh.protocols.includes(protocol)) throw executionError('Model')
                        assertRequestCapabilities(parsed, fresh.capabilities)
                        if (outputLimit > grant.limits.maxOutputTokens) throw executionError('OutputLimit')
                        if (bodyBytes > grant.limits.maxInputTokens) throw executionError('InputLimit')
                        await this.assistants.authorize(identity.actor, grant.context.xpertId, fresh)
                        abort.signal.throwIfAborted()
                        await this.admission.dispatch(call, grant)
                    },
                    createModel: async (usageCallback) => {
                        const client = await this.runtime.createModelClient<BaseChatModel>(
                            {
                                copilotId: model.copilotId,
                                model: model.model,
                                modelType: model.modelType,
                                options: { max_tokens: outputLimit, maxRetries: 0 }
                            },
                            {
                                usageCallback,
                                skipTokenRecord: true,
                                modelAccessOverride: resolution,
                                expectedExecutionModel: model
                            },
                            {
                                tenantId: grant.tenantId,
                                organizationId: grant.context.runtimeOrganizationId,
                                userId: grant.context.billableUserId,
                                xpertId: grant.context.xpertId
                            }
                        )
                        // Provider defaults may retry even when model options request zero retries.
                        client.caller = new AsyncCaller({ maxRetries: 0 })
                        return client
                    },
                    settle: (result) => this.metering.finish({ ...result, call, grant, model, resolution })
                }
            })
        })
    }
}
