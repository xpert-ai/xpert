// Invariants: middleware selects from registered tools before any model is bound.
// Each invocation owns its selection; retries and fallbacks share that snapshot.
// Prepare messages against each provider's capabilities without mutating history.
import type { LanguageModelLike } from '@langchain/core/language_models/base'
import type { BaseChatModel, BaseChatModelCallOptions } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage, SystemMessage } from '@langchain/core/messages'
import { Runnable, RunnableConfig, RunnableLambda } from '@langchain/core/runnables'
import { isLangChainTool, isRunnableToolLike } from '@langchain/core/utils/function_calling'
import { BaseChatOpenAI } from '@langchain/openai'
import type { IXpertAgent } from '@xpert-ai/contracts'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'
import { prepareMessagesForModel } from '../../copilot-model/model-capabilities'
import { ToolSchemaParser } from '../tools/utils'
import { createParameters } from './parameter'
import { FakeStreamingChatModel } from './fake-streaming-chat-model'

type ToolBindableModel = LanguageModelLike & { bindTools: NonNullable<BaseChatModel['bindTools']> }
type StructuredOutputModel = LanguageModelLike & { withStructuredOutput: BaseChatModel['withStructuredOutput'] }
type ToolBindOptions = Partial<BaseChatModelCallOptions> & {
    tool_choice?: string | Extract<ModelRequest['toolChoice'], object>
    parallel_tool_calls?: boolean
}

export interface ModelCallOptions {
    registeredTools: ReadonlyArray<ModelRequest['tools'][number]>
    agent: Pick<IXpertAgent, 'options' | 'outputVariables'>
    resolveFallbackModel?: () => Promise<LanguageModelLike>
}

/**
 * Expose provider metadata on the unbound model for existing capability-aware
 * middleware. This does not wrap the model or hide bindTools/withStructuredOutput.
 */
export function exposeModelProfile<T extends LanguageModelLike>(model: T): T {
    if ('profile' in model && model.profile) {
        return model
    }
    const metadata = 'metadata' in model ? model.metadata : undefined
    const profile = metadata && typeof metadata === 'object' && 'profile' in metadata ? metadata.profile : undefined
    if (profile && typeof profile === 'object') {
        Object.defineProperty(model, 'profile', { configurable: true, enumerable: true, value: profile })
    }
    return model
}

/**
 * Finalize one middleware request. Only this terminal boundary binds the selected
 * tools or output schema, including when middleware replaces the model. Execution
 * authorization remains the responsibility of the tool execution boundary.
 */
export async function prepareModelCall(
    request: Pick<ModelRequest, 'model' | 'messages' | 'systemMessage' | 'tools' | 'toolChoice'>,
    { registeredTools, agent, resolveFallbackModel }: ModelCallOptions
) {
    const tools = [...request.tools]
    const toolChoice: ModelRequest['toolChoice'] =
        typeof request.toolChoice === 'object'
            ? { type: request.toolChoice.type, function: { name: request.toolChoice.function.name } }
            : request.toolChoice
    validateToolSelection(tools, registeredTools, toolChoice)
    const options = agent.options
    const structuredOutputMethod = tools.length ? undefined : options?.structuredOutputMethod
    if (toolChoice === 'none' && structuredOutputMethod === 'functionCalling') {
        throw new Error(
            t('server-ai:Error.AgentToolChoiceStructuredConflict', {
                defaultValue:
                    'Tool choice none cannot be combined with functionCalling output. Use a JSON output method.'
            })
        )
    }
    const schema = structuredOutputMethod ? z.object({ ...createParameters(agent.outputVariables) }) : undefined
    let systemMessage = request.systemMessage
    if (structuredOutputMethod === 'jsonMode') {
        const instruction = `\n\n\`\`\`json\n${ToolSchemaParser.serializeJsonSchema(ToolSchemaParser.parseZodToJsonSchema(schema))}\n\`\`\``
        systemMessage = new SystemMessage({
            ...systemMessage,
            content: !systemMessage
                ? instruction
                : typeof systemMessage.content === 'string'
                  ? systemMessage.content + instruction
                  : [...systemMessage.content, { type: 'text', text: instruction }]
        })
    }
    const messages = systemMessage ? [systemMessage, ...request.messages] : [...request.messages]

    const bindModel = (model: LanguageModelLike): Runnable => {
        let bound: Runnable = model
        if (tools.length) {
            if (!canBindTools(model)) {
                throw new Error(
                    t('server-ai:Error.AgentModelCannotBindTools', {
                        defaultValue: 'The selected model must support bindTools. Supply an unbound chat model.'
                    })
                )
            }
            const bindOptions: ToolBindOptions = {}
            if (toolChoice) {
                // LangChain provider adapters translate these portable choices.
                if (
                    typeof toolChoice === 'object' &&
                    !(model instanceof BaseChatOpenAI) &&
                    ['auto', 'none', 'any', 'required'].includes(toolChoice.function.name)
                ) {
                    throw new Error(
                        t('server-ai:Error.AgentToolChoiceReservedName', {
                            defaultValue:
                                'This model adapter cannot force a tool whose name is a reserved tool choice: {{name}}',
                            name: toolChoice.function.name
                        })
                    )
                }
                bindOptions.tool_choice =
                    typeof toolChoice === 'object'
                        ? model instanceof BaseChatOpenAI
                            ? toolChoice
                            : toolChoice.function.name
                        : toolChoice === 'required'
                          ? 'any'
                          : toolChoice
            }
            if (options?.parallelToolCalls === false && model instanceof BaseChatOpenAI) {
                bindOptions.parallel_tool_calls = false
            }
            bound = model.bindTools(tools, bindOptions)
        } else if (schema) {
            if (!canStructureOutput(model)) {
                throw new Error(
                    t('server-ai:Error.AgentModelCannotStructureOutput', {
                        defaultValue:
                            'The selected model must support withStructuredOutput. Supply an unbound chat model.'
                    })
                )
            }
            bound = model.withStructuredOutput(schema, { method: structuredOutputMethod })
        }
        return RunnableLambda.from((input: BaseMessage[], config?: RunnableConfig) => {
            config?.signal?.throwIfAborted()
            return bound.invoke(prepareMessagesForModel(input, model), config)
        })
    }

    let model = bindModel(request.model)
    if (options?.retry?.enabled) {
        model = model.withRetry({ stopAfterAttempt: options.retry.stopAfterAttempt ?? 2 })
    }
    if (options?.fallback?.enabled) {
        if (!options.fallback.copilotModel?.model || !resolveFallbackModel) {
            throw new Error(
                t('server-ai:Error.AgentFallbackModelMissing', {
                    defaultValue: 'Configure a fallback model before enabling model fallback.'
                })
            )
        }
        model = model.withFallbacks([bindModel(await resolveFallbackModel())])
    }
    if (options?.errorHandling?.type === 'defaultValue') {
        const content = options.errorHandling.defaultValue?.content
        if (!content) {
            throw new Error(
                t('server-ai:Error.AgentDefaultResponseMissing', {
                    defaultValue: 'Configure default response content before enabling the default response.'
                })
            )
        }
        const defaultModel = new FakeStreamingChatModel({ responses: [new AIMessage(content)] })
        model = model.withFallbacks([
            RunnableLambda.from((input: BaseMessage[], config?: RunnableConfig) => {
                config?.signal?.throwIfAborted()
                return defaultModel.invoke(input, config)
            })
        ])
    }
    return { model, messages, systemMessage }
}

function canBindTools(model: LanguageModelLike): model is ToolBindableModel {
    return 'bindTools' in model && typeof model.bindTools === 'function'
}

function canStructureOutput(model: LanguageModelLike): model is StructuredOutputModel {
    return 'withStructuredOutput' in model && typeof model.withStructuredOutput === 'function'
}

function validateToolSelection(
    tools: ModelRequest['tools'],
    registeredTools: ModelCallOptions['registeredTools'],
    choice: ModelRequest['toolChoice']
) {
    const registered = new Set(registeredTools)
    if (tools.some((tool) => !registered.has(tool)) || new Set(tools).size !== tools.length) {
        throw new Error(
            t('server-ai:Error.AgentToolSelectionInvalid', {
                defaultValue:
                    'Select each tool at most once from the registered tools. New tools require runtime registration.'
            })
        )
    }
    if (choice === 'required' && !tools.length) {
        throw new Error(
            t('server-ai:Error.AgentToolChoiceRequiresTools', {
                defaultValue: 'Required tool choice needs at least one selected tool.'
            })
        )
    }
    if (typeof choice === 'object' && !tools.some((tool) => getToolName(tool) === choice.function.name)) {
        throw new Error(
            t('server-ai:Error.AgentToolChoiceNotSelected', {
                defaultValue: 'The requested tool is not in the selected tool set: {{name}}',
                name: choice.function.name
            })
        )
    }
}

function getToolName(tool: ModelRequest['tools'][number]): string | undefined {
    if (isLangChainTool(tool) || isRunnableToolLike(tool)) {
        return tool.name
    }
    if ('type' in tool && tool.type === 'function' && 'function' in tool) {
        const definition = tool.function
        if (
            definition &&
            typeof definition === 'object' &&
            'name' in definition &&
            typeof definition.name === 'string'
        ) {
            return definition.name
        }
    }
    return undefined
}
