import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { HumanMessage } from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import {
    ChatMessageEventTypeEnum,
    createConversationTitleSummaryEvent,
    ICopilot,
    IXpert,
    mapTranslationLanguage,
    STATE_VARIABLE_SYS,
    STATE_VARIABLE_TITLE_CHANNEL,
    TAgentRunnableConfigurable,
    TMessageChannel,
    TXpertAgentExecution,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { getErrorMessage } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
import { v4 as uuidv4 } from 'uuid'
import { CopilotModelGetChatModelQuery } from '../../copilot-model'
import { XpertCopilotNotFoundException } from '../../core/errors'
import { assignExecutionUsage, XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution'
import { GetXpertChatModelQuery } from '../../xpert/queries'
import { AgentStateAnnotation } from './state'

type GenerateConversationTitleOptions = {
    channel?: string | null
    config?: RunnableConfig | null
    copilot?: ICopilot
    instruction?: string | null
    state: typeof AgentStateAnnotation.State
    xpert?: IXpert
}

@Injectable()
export class ConversationTitleService {
    readonly #logger = new Logger(ConversationTitleService.name)

    constructor(
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly i18nService: I18nService
    ) {}

    async generateStatePatch(
        options: GenerateConversationTitleOptions
    ): Promise<Partial<typeof AgentStateAnnotation.State> | null> {
        const { channel, config, copilot, instruction, state, xpert } = options
        const messages = channel ? (<TMessageChannel | undefined>state[channel])?.messages : state.messages

        if (!messages?.length) {
            return null
        }

        const configurable = (config?.configurable ?? {}) as Partial<TAgentRunnableConfigurable>
        const execution = {} as TXpertAgentExecution
        const abortController = this.createAbortController(config?.signal)
        const threadId = configurable.thread_id
        const rootExecutionId = configurable.rootExecutionId ?? configurable.executionId
        const chatModel = await this.resolveChatModel({
            abortController,
            copilot,
            execution,
            threadId,
            xpert
        })

        const runId = typeof config?.metadata?.run_id === 'string' ? config.metadata.run_id : undefined
        await dispatchCustomEvent(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            createConversationTitleSummaryEvent({
                id: runId,
                title: t('server-ai:Xpert.SummaryTitleStarting'),
                status: 'running',
                created_date: new Date().toISOString()
            })
        )

        const startedAt = Date.now()
        let status = XpertAgentExecutionStatusEnum.SUCCESS
        let error: string | null = null
        let output: string | null = null
        const persistedExecution = await this.commandBus.execute(
            new XpertAgentExecutionUpsertCommand({
                ...execution,
                threadId,
                checkpointId: configurable.checkpoint_id,
                checkpointNs: '',
                parentId: rootExecutionId,
                status: XpertAgentExecutionStatusEnum.RUNNING,
                channelName: STATE_VARIABLE_TITLE_CHANNEL,
                title: await this.i18nService.t('xpert.Agent.SummarizeTitle', {
                    lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                })
            })
        )

        try {
            const language = state[STATE_VARIABLE_SYS]?.language
            const prompt =
                instruction?.trim() ||
                xpert?.features?.title?.instruction?.trim() ||
                `Create a short title${language ? ` in language '${language}'` : ''} for the conversation above, without adding any extra phrases like 'Conversation Title:':`
            const allMessages = [
                ...messages,
                new HumanMessage({
                    id: uuidv4(),
                    content: prompt
                })
            ]
            const response = await chatModel.invoke(allMessages)

            if (typeof response.content !== 'string') {
                throw new Error('Expected a string response from the model')
            }

            output = response.content

            return {
                title: response.content.replace(/^"/g, '').replace(/"$/g, ''),
                [STATE_VARIABLE_TITLE_CHANNEL]: {
                    messages: [...allMessages, response]
                }
            }
        } catch (err) {
            error = getErrorMessage(err)
            status = XpertAgentExecutionStatusEnum.ERROR
            this.#logger.error(error)
            return null
        } finally {
            await this.commandBus.execute(
                new XpertAgentExecutionUpsertCommand({
                    ...execution,
                    id: persistedExecution.id,
                    elapsedTime: Date.now() - startedAt,
                    status,
                    error,
                    outputs: {
                        output
                    }
                })
            )
            await dispatchCustomEvent(
                ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                createConversationTitleSummaryEvent({
                    id: runId,
                    title: t('server-ai:Xpert.SummaryTitleEnd'),
                    status: status === XpertAgentExecutionStatusEnum.SUCCESS ? 'success' : 'fail',
                    end_date: new Date().toISOString()
                })
            )
        }
    }

    private async resolveChatModel(options: {
        abortController: AbortController
        copilot?: ICopilot
        execution: TXpertAgentExecution
        threadId?: string
        xpert?: IXpert
    }) {
        const { abortController, copilot, execution, threadId, xpert } = options

        if (xpert) {
            const copilotModel = xpert.copilotModel
            if (!copilotModel) {
                throw new XpertCopilotNotFoundException(
                    await this.i18nService.t('xpert.Error.XpertCopilotNotFound', {
                        lang: mapTranslationLanguage(RequestContext.getLanguageCode())
                    })
                )
            }
            execution.metadata = {
                provider: copilotModel.copilot.modelProvider?.providerName,
                model: copilotModel.model || copilotModel.copilot.copilotModel?.model
            }
            return this.queryBus.execute<GetXpertChatModelQuery, BaseChatModel>(
                new GetXpertChatModelQuery(xpert, null, {
                    copilotModel,
                    abortController,
                    usageCallback: assignExecutionUsage(execution),
                    threadId
                })
            )
        }

        if (!copilot) {
            throw new Error('Missing xpert or copilot for title generation')
        }

        return this.queryBus.execute(
            new CopilotModelGetChatModelQuery(copilot, null, {
                abortController,
                usageCallback: assignExecutionUsage(execution)
            })
        )
    }

    private createAbortController(signal?: AbortSignal) {
        const abortController = new AbortController()

        if (!signal) {
            return abortController
        }

        if (signal.aborted) {
            abortController.abort()
            return abortController
        }

        const abort = () => abortController.abort()
        signal.addEventListener('abort', abort, { once: true })
        abortController.signal.addEventListener(
            'abort',
            () => {
                signal.removeEventListener('abort', abort)
            },
            { once: true }
        )

        return abortController
    }
}
