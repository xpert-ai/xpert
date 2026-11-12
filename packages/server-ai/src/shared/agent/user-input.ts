// Register one stable tool contract. Runtime state selects the allowed protocol;
// response purpose is derived from the server request, never the client response.
import { SystemMessage } from '@langchain/core/messages'
import { t } from 'i18next'
import {
    isRequestUserInputForm,
    REQUEST_USER_INPUT_TOOL_NAME,
    USER_INPUT_FORM_SCHEMA,
    validateUserInputValues,
    type RequestUserInputResult
} from '@xpert-ai/chatkit-types'
import type { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type {
    ClientToolMiddleware,
    ClientToolMessageResolver,
    ClientToolMiddlewareConfig
} from '../../xpert-middleware/client-tool.middleware'
import { isPlanModeEnabledFromState, PLAN_MODE_REQUEST_USER_INPUT_SCHEMA } from './plan-mode'
import { isPlanModeUserInput, resolvePlanModeUserInputMessage } from './user-input-plan'

export const REQUEST_USER_INPUT_MIDDLEWARE_NAME = 'RequestUserInputMiddleware'
export const REQUEST_USER_INPUT_SCHEMA = {
    type: 'object',
    properties: { ...USER_INPUT_FORM_SCHEMA.properties, ...PLAN_MODE_REQUEST_USER_INPUT_SCHEMA.properties },
    additionalProperties: false,
    oneOf: [USER_INPUT_FORM_SCHEMA, PLAN_MODE_REQUEST_USER_INPUT_SCHEMA]
}

function invalidInput() {
    return new Error(
        t('server-ai:UserInput.InvalidResponse', {
            defaultValue: 'The user input response is invalid. Please submit the requested fields again.'
        })
    )
}

export const resolveUserInputMessage: ClientToolMessageResolver = (message, call, executeClientTool) => {
    const form = call.args
    if (isPlanModeUserInput(form)) return resolvePlanModeUserInputMessage(message, call, executeClientTool)
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

export async function createUserInputMiddleware(
    clientTools: ClientToolMiddleware,
    context: IAgentMiddlewareContext
): Promise<AgentMiddleware> {
    const config: ClientToolMiddlewareConfig = {
        clientTools: [
            {
                name: REQUEST_USER_INPUT_TOOL_NAME,
                description:
                    'Ask the user for information and wait for a response. In ordinary runs, use the schemaVersion 1 blocking fields form for clarification only. In Plan Mode, use questions for plan clarification or the final implement_plan confirmation. These two argument formats are mutually exclusive.',
                schema: JSON.stringify(REQUEST_USER_INPUT_SCHEMA)
            }
        ],
        resolveClientToolMessage: resolveUserInputMessage
    }
    const middleware = await clientTools.createMiddleware(config, context)
    const wrapToolCall = middleware.wrapToolCall
    return {
        ...middleware,
        wrapToolCall: async (request, handler) => {
            if (request.toolCall.name === REQUEST_USER_INPUT_TOOL_NAME) {
                const args = request.toolCall.args
                if (isPlanModeEnabledFromState(request.state)) {
                    if (!isPlanModeUserInput(args)) throw invalidInput()
                } else {
                    if (!isRequestUserInputForm(args)) throw invalidInput()
                    if (args.mode !== 'blocking')
                        throw new Error(
                            t('server-ai:UserInput.UnsupportedMode', {
                                defaultValue: 'Non-blocking user input is not supported by this runtime.'
                            })
                        )
                }
            }
            return wrapToolCall ? wrapToolCall(request, handler) : handler(request)
        },
        wrapModelCall: (request, handler) => {
            if (!request.tools.some((tool) => tool.name === REQUEST_USER_INPUT_TOOL_NAME)) return handler(request)
            const content = request.systemMessage?.content ?? ''
            const prompt =
                'When essential information is missing, use request_user_input with schemaVersion 1, mode blocking and purpose clarification. First inspect available context. Ask only relevant missing fields and batch related questions. Do not collect secrets. A cancelled result means the user did not answer: explain the limitation or proceed only with safe, explicit assumptions; do not immediately repeat the same form. A submitted form supplies information only, never action approval. Ordinary conversations may clarify again when new information warrants it.'
            return handler({
                ...request,
                systemMessage: new SystemMessage({
                    content:
                        typeof content === 'string'
                            ? `${content}\n\n${prompt}`
                            : [...content, { type: 'text', text: prompt }]
                })
            })
        }
    }
}
