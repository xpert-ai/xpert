import { Injectable, BadRequestException, GatewayTimeoutException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AiModelTypeEnum, AiProviderRole, ICopilot } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { CopilotOneByRoleQuery } from './queries/get-one-by-role.query'
import { CopilotModelGetChatModelQuery } from '../copilot-model/queries/get-chat-model.query'

// Invariants: only an explicit request spends model tokens. Providers may ignore
// AbortSignal, so the deadline must bound the response independently of abort.
@Injectable()
export class PrimaryModelSmokeService {
    constructor(private readonly queryBus: QueryBus) {}

    async verify(): Promise<void> {
        const abortController = new AbortController()
        let timer: ReturnType<typeof setTimeout>
        const deadline = new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
                reject(
                    new GatewayTimeoutException(
                        t('server-ai:Error.PrimaryModelVerificationTimedOut', {
                            defaultValue: 'Primary LLM verification timed out after 20 seconds.'
                        })
                    )
                )
                abortController.abort()
            }, 20000)
        })
        try {
            await Promise.race([this.infer(abortController), deadline])
        } finally {
            clearTimeout(timer)
        }
    }

    private async infer(abortController: AbortController): Promise<void> {
        const copilot = await this.queryBus.execute<CopilotOneByRoleQuery, ICopilot | null>(
            new CopilotOneByRoleQuery(
                RequestContext.currentTenantId(),
                RequestContext.getOrganizationId(),
                AiProviderRole.Primary,
                ['copilotModel']
            )
        )
        abortController.signal.throwIfAborted()
        if (
            !copilot?.id ||
            copilot.enabled === false ||
            !copilot.copilotModel?.model?.trim() ||
            (copilot.copilotModel.modelType && copilot.copilotModel.modelType !== AiModelTypeEnum.LLM)
        ) {
            throw new BadRequestException(
                t('server-ai:Error.ManagedImportRequiresPrimaryLlmModel', { scope: RequestContext.getOrganizationId() })
            )
        }
        const model = await this.queryBus.execute<CopilotModelGetChatModelQuery, BaseChatModel>(
            new CopilotModelGetChatModelQuery(
                copilot,
                {
                    ...copilot.copilotModel,
                    options: { ...copilot.copilotModel.options, max_tokens: 16 }
                },
                { abortController, usageCallback: () => undefined }
            )
        )
        abortController.signal.throwIfAborted()
        const response = await model.invoke('Reply with OK.', { signal: abortController.signal })
        if (!response.content?.length) {
            throw new BadRequestException(
                t('server-ai:Error.PrimaryModelEmptyResponse', {
                    defaultValue: 'The Primary LLM returned an empty response.'
                })
            )
        }
    }
}
