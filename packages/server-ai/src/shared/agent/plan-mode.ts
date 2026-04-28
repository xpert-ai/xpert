import { SystemMessage } from '@langchain/core/messages'
import { AgentMiddleware, AgentMiddlewareRegistry, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { IWFNMiddleware, STATE_VARIABLE_HUMAN, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'

export const PLAN_MODE_HUMAN_INPUT_KEY = 'planMode'
export const PLAN_MODE_CLIENT_TOOL_MIDDLEWARE_KEY = '__xpert_plan_mode_client_tool__'
export const PLAN_MODE_PROMPT_MIDDLEWARE_KEY = '__xpert_plan_mode_prompt__'

const CLIENT_TOOL_MIDDLEWARE_NAME = 'ClientToolMiddleware'
const REQUEST_USER_INPUT_TOOL_NAME = 'request_user_input'

const PLAN_MODE_PROMPT = `You are operating in Plan Mode.

In Plan Mode:
- Do not implement, mutate files, run migrations, or perform destructive actions.
- First understand the user's goal and inspect non-mutating context when needed.
- If a high-impact product or implementation decision is missing, call the request_user_input tool with 1 to 3 questions before finalizing.
- request_user_input arguments must be JSON with this shape: {"questions":[{"id":"stable_snake_case_id","header":"Short label","question":"Question text","options":[{"label":"Option label","description":"Option impact"}]}]}.
- Each question must have 2 or 3 options. Put "(Recommended)" in the recommended option label when there is a clear default.
- When ready, produce exactly one final plan wrapped in <proposed_plan> and </proposed_plan>.`

export const PLAN_MODE_REQUEST_USER_INPUT_SCHEMA = JSON.stringify({
    type: 'object',
    additionalProperties: false,
    properties: {
        questions: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    id: {
                        type: 'string',
                        minLength: 1
                    },
                    header: {
                        type: 'string',
                        minLength: 1
                    },
                    question: {
                        type: 'string',
                        minLength: 1
                    },
                    options: {
                        type: 'array',
                        minItems: 2,
                        maxItems: 3,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                label: {
                                    type: 'string',
                                    minLength: 1
                                },
                                description: {
                                    type: 'string'
                                }
                            },
                            required: ['label', 'description']
                        }
                    }
                },
                required: ['id', 'header', 'question', 'options']
            }
        }
    },
    required: ['questions']
})

function isRecord(value: unknown): value is Record<string, any> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function getPlanModeHumanInput(value: unknown): Record<string, any> | null {
    if (!isRecord(value)) {
        return null
    }

    const human = value[STATE_VARIABLE_HUMAN]
    return isRecord(human) ? human : null
}

export function isPlanModeEnabledFromState(value: unknown): boolean {
    return getPlanModeHumanInput(value)?.[PLAN_MODE_HUMAN_INPUT_KEY] === true
}

export function hasExplicitPlanModeFlag(value: unknown): boolean {
    const human = getPlanModeHumanInput(value)
    return !!human && Object.prototype.hasOwnProperty.call(human, PLAN_MODE_HUMAN_INPUT_KEY)
}

function createPlanModeNode(key: string, provider: string): IWFNMiddleware {
    return {
        key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider
    } as IWFNMiddleware
}

export async function createPlanModeMiddlewareEntries(
    agentMiddlewareRegistry: AgentMiddlewareRegistry,
    context: Omit<IAgentMiddlewareContext, 'node'>,
    enabled?: boolean
): Promise<Array<{ key: string; middleware: AgentMiddleware }>> {
    if (!enabled) {
        return []
    }

    const clientToolStrategy = agentMiddlewareRegistry.get(CLIENT_TOOL_MIDDLEWARE_NAME)
    const clientToolMiddleware = await clientToolStrategy.createMiddleware(
        {
            clientTools: [
                {
                    name: REQUEST_USER_INPUT_TOOL_NAME,
                    description:
                        'Ask the user one to three Plan Mode confirmation questions and resume with structured answers.',
                    schema: PLAN_MODE_REQUEST_USER_INPUT_SCHEMA
                }
            ]
        },
        {
            ...context,
            node: createPlanModeNode(PLAN_MODE_CLIENT_TOOL_MIDDLEWARE_KEY, CLIENT_TOOL_MIDDLEWARE_NAME)
        }
    )

    const promptMiddleware: AgentMiddleware = {
        name: 'PlanModePromptMiddleware',
        wrapModelCall: (request, handler) => {
            const systemMessage = request.systemMessage
            const content = typeof systemMessage === 'string' ? systemMessage : ((systemMessage?.content as string) ?? '')

            return handler({
                ...request,
                systemMessage: new SystemMessage(`${content}\n\n${PLAN_MODE_PROMPT}`)
            })
        }
    }

    return [
        {
            key: PLAN_MODE_CLIENT_TOOL_MIDDLEWARE_KEY,
            middleware: clientToolMiddleware
        },
        {
            key: PLAN_MODE_PROMPT_MIDDLEWARE_KEY,
            middleware: promptMiddleware
        }
    ]
}
