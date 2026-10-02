import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { ILLMUsage, IModelAccessResolution } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime'
import { ModelGatewayPublication } from './model-gateway-publication.entity'
import { modelGatewayMessage } from './model-gateway.i18n'

export async function createGatewayChatModel(
    runtimeService: AgentMiddlewareRuntimeService,
    publication: ModelGatewayPublication,
    resolution: IModelAccessResolution,
    usageCallback: (usage: ILLMUsage) => void
) {
    const client = await runtimeService.createModelClient<BaseChatModel>(
        {
            copilotId: publication.copilotId,
            model: publication.copilotModelId,
            modelType: publication.modelType
        },
        {
            usageCallback,
            modelAccessOverride: resolution,
            skipTokenRecord: true
        },
        {
            tenantId: publication.tenantId,
            organizationId: publication.organizationId ?? null,
            userId: resolution.billableUserId
        }
    )
    if (!client || typeof client.invoke !== 'function' || typeof client.stream !== 'function') {
        throw new BadRequestException(
            modelGatewayMessage('ModelGatewaySourceNotChat', 'Published source is not a chat model.')
        )
    }
    return client
}
