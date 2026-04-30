import { SystemMessage } from '@langchain/core/messages'
import { AgentMiddleware, AgentMiddlewareRegistry, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { IWFNMiddleware, STATE_VARIABLE_HUMAN, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import {
    REQUEST_USER_INPUT_TOOL_NAME,
    type RequestUserInputOption,
    type RequestUserInputQuestion,
    type RequestUserInputToolArgs
} from '@xpert-ai/chatkit-types'

export const PLAN_MODE_HUMAN_INPUT_KEY = 'planMode'
export const PLAN_MODE_CLIENT_TOOL_MIDDLEWARE_KEY = '__xpert_plan_mode_client_tool__'
export const PLAN_MODE_PROMPT_MIDDLEWARE_KEY = '__xpert_plan_mode_prompt__'

const CLIENT_TOOL_MIDDLEWARE_NAME = 'ClientToolMiddleware'

type JsonObjectSchema<T extends object> = {
    type: 'object'
    additionalProperties?: boolean
    properties: { [K in keyof T]-?: unknown }
    required: Array<Extract<keyof T, string>>
}

const PLAN_MODE_REQUEST_USER_INPUT_EXAMPLE: RequestUserInputToolArgs = {
    questions: [
        {
            id: 'stable_snake_case_id',
            header: 'Short label',
            question: 'Question text',
            options: [
                {
                    label: 'Option A',
                    description: 'Option A impact'
                },
                {
                    label: 'Option B',
                    description: 'Option B impact'
                }
            ]
        }
    ]
}

const PLAN_MODE_IMPLEMENT_PLAN_REQUEST: RequestUserInputToolArgs = {
    questions: [
        {
            id: 'implement_plan',
            header: 'Confirm',
            question: 'Implement this plan?',
            options: [
                {
                    label: 'Yes, implement this plan',
                    description: 'Proceed with the proposed implementation.'
                },
                {
                    label: 'No, stop here',
                    description: 'Do not implement anything and end this conversation.'
                }
            ]
        }
    ]
}

const PLAN_MODE_PROMPT = [
    'You are operating in Plan Mode.',
    '',
    'In Plan Mode:',
    '- Before the user confirms implementation, do not implement, mutate files, run migrations, or perform destructive actions.',
    "- First understand the user's goal and inspect non-mutating context when needed.",
    '- Treat Plan Mode as a strict state machine: clarify intent, propose a plan, then implement only after explicit approval.',
    `- You may call the ${REQUEST_USER_INPUT_TOOL_NAME} tool for clarification at most once before proposing the plan.`,
    `- If a high-impact product or implementation decision is missing and you have not already asked clarification questions, call the ${REQUEST_USER_INPUT_TOOL_NAME} tool with 1 to 3 questions before finalizing the plan.`,
    '- If important details are still missing after clarification answers, make conservative assumptions in the proposed plan instead of asking another clarification round.',
    `- ${REQUEST_USER_INPUT_TOOL_NAME} arguments must be JSON with this shape: ${JSON.stringify(PLAN_MODE_REQUEST_USER_INPUT_EXAMPLE)}.`,
    '- Each question must have 2 or 3 options. Put "(Recommended)" in the recommended option label when there is a clear default.',
    '- request_user_input results have a content.type of "request_user_input_result" and a content.purpose.',
    '- If you receive content.purpose "plan_clarification", those answers only resolve planning questions. They are never approval to implement.',
    `- After receiving "plan_clarification" answers, do not call ${REQUEST_USER_INPUT_TOOL_NAME} for more clarification. Your next assistant response must present the proposed plan. Do not implement first.`,
    '- When the plan is ready, show the proposed plan to the user wrapped in <proposed_plan> and </proposed_plan>, with each tag on its own line.',
    '- Inside <proposed_plan>, write the plan directly as Markdown, starting with a single "# <Plan title>" heading.',
    '- Do not wrap the proposed plan in a fenced code block.',
    `- Only after the current assistant response contains a complete <proposed_plan> block may you call ${REQUEST_USER_INPUT_TOOL_NAME} to ask whether to implement it. Use this exact question structure: ${JSON.stringify(PLAN_MODE_IMPLEMENT_PLAN_REQUEST)}.`,
    `- Never call the implementation confirmation question unless the same assistant response has already presented the proposed plan.`,
    `- Do not start implementation until you receive content.purpose "implementation_confirmation" and its ${REQUEST_USER_INPUT_TOOL_NAME} answer with id "implement_plan" explicitly selects "Yes, implement this plan".`,
    '- If the user selects "No, stop here" or provides any Other answer that does not explicitly approve implementation, do not implement. Reply briefly that you will stop and end the conversation.'
].join('\n')

const REQUEST_USER_INPUT_OPTION_SCHEMA = {
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
} satisfies JsonObjectSchema<RequestUserInputOption>

const REQUEST_USER_INPUT_QUESTION_SCHEMA = {
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
            items: REQUEST_USER_INPUT_OPTION_SCHEMA
        }
    },
    required: ['id', 'header', 'question', 'options']
} satisfies JsonObjectSchema<RequestUserInputQuestion>

const REQUEST_USER_INPUT_PARAMS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        questions: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: REQUEST_USER_INPUT_QUESTION_SCHEMA
        }
    },
    required: ['questions']
} satisfies JsonObjectSchema<RequestUserInputToolArgs>

export const PLAN_MODE_REQUEST_USER_INPUT_SCHEMA = JSON.stringify(REQUEST_USER_INPUT_PARAMS_SCHEMA)

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
                        'Plan Mode user input. Use once for clarification before a plan, or after a visible proposed plan only for the final implementation confirmation. Never use for repeated clarification rounds.',
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
            const content =
                typeof systemMessage === 'string' ? systemMessage : ((systemMessage?.content as string) ?? '')

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
