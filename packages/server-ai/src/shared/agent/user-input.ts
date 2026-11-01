// Input collection is independent of Plan Mode. Async delivery must not silently block.
import { SystemMessage } from '@langchain/core/messages'
import { t } from 'i18next'
import {
    isRequestUserInputForm,
    REQUEST_USER_INPUT_TOOL_NAME,
    USER_INPUT_FORM_SCHEMA,
    validateUserInputValues,
    type RequestUserInputResult
} from '@xpert-ai/chatkit-types'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, type AgentMiddleware, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type {
    ClientToolMessageResolver,
    ClientToolMiddlewareConfig
} from '../../xpert-middleware/client-tool.middleware'
import { inheritMiddlewareToolDisplayMetadata } from './middleware'

function invalidInput() {
    return new Error(
        t('server-ai:UserInput.InvalidResponse', {
            defaultValue: 'The user input response is invalid. Please submit the requested fields again.'
        })
    )
}

export const resolveUserInputMessage: ClientToolMessageResolver = (message, call) => {
    const form = call.args
    if (!isRequestUserInputForm(form) || form.mode !== 'blocking') throw invalidInput()
    let content: unknown = message.content
    if (typeof content === 'string') {
        try {
            content = JSON.parse(content)
        } catch {
            throw invalidInput()
        }
    }
    if (
        !content ||
        typeof content !== 'object' ||
        !('type' in content) ||
        content.type !== 'request_user_input_result' ||
        !('requestId' in content) ||
        content.requestId !== call.id ||
        !('status' in content) ||
        (content.status !== 'submitted' && content.status !== 'cancelled')
    )
        throw invalidInput()
    const result: RequestUserInputResult = {
        type: 'request_user_input_result',
        schemaVersion: 1,
        requestId: call.id,
        purpose: 'clarification',
        status: content.status,
        answers: [],
        form
    }
    if (content.status === 'submitted') {
        const parsed = validateUserInputValues(form, 'values' in content ? content.values : undefined)
        if (!parsed.valid) throw invalidInput()
        result.values = parsed.values
    }
    return { tool_call_id: call.id, name: REQUEST_USER_INPUT_TOOL_NAME, status: 'success', content: result }
}

export async function createUserInputMiddlewareEntries(
    registry: AgentMiddlewareRegistry,
    context: Omit<IAgentMiddlewareContext, 'node'>
): Promise<Array<{ key: string; middleware: AgentMiddleware }>> {
    const strategy = registry.get('ClientToolMiddleware')
    const config: ClientToolMiddlewareConfig = {
        clientTools: [
            {
                name: REQUEST_USER_INPUT_TOOL_NAME,
                description:
                    'Ask the user for missing information in a structured form, then continue the same task. Use only when the answer materially affects the result and cannot be found in available context. Supports multiple clarification rounds. Input collection never approves actions. Only blocking mode is currently supported.',
                schema: JSON.stringify(USER_INPUT_FORM_SCHEMA)
            }
        ],
        resolveClientToolMessage: resolveUserInputMessage
    }
    const middleware = inheritMiddlewareToolDisplayMetadata(
        await strategy.createMiddleware(config, {
            ...context,
            node: {
                id: '__xpert_user_input__',
                key: '__xpert_user_input__',
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: 'ClientToolMiddleware'
            }
        }),
        strategy.meta
    )
    const wrapToolCall = middleware.wrapToolCall
    const guarded: AgentMiddleware = {
        ...middleware,
        wrapToolCall: async (request, handler) => {
            if (request.toolCall.name === REQUEST_USER_INPUT_TOOL_NAME) {
                if (!isRequestUserInputForm(request.toolCall.args)) throw invalidInput()
                if (request.toolCall.args.mode !== 'blocking')
                    throw new Error(
                        t('server-ai:UserInput.UnsupportedMode', {
                            defaultValue: 'Non-blocking user input is not supported by this runtime.'
                        })
                    )
            }
            return wrapToolCall ? wrapToolCall(request, handler) : handler(request)
        }
    }
    return [
        { key: '__xpert_user_input__', middleware: guarded },
        {
            key: '__xpert_user_input_prompt__',
            middleware: {
                name: 'UserInputPromptMiddleware',
                wrapModelCall: (request, handler) => {
                    const previous =
                        typeof request.systemMessage === 'string'
                            ? request.systemMessage
                            : (request.systemMessage?.content ?? '')
                    return handler({
                        ...request,
                        systemMessage: new SystemMessage(
                            `${previous}\nWhen essential information is missing, use request_user_input with schemaVersion 1, mode blocking and purpose clarification. First inspect available context. Ask only relevant missing fields and batch related questions. Do not collect secrets. A cancelled result means the user did not answer: explain the limitation or proceed only with safe, explicit assumptions; do not immediately repeat the same form. A submitted form supplies information only, never action approval. Ordinary conversations may clarify again when new information warrants it.`
                        )
                    })
                }
            }
        }
    ]
}
