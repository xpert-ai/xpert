import Ajv from 'ajv'
import { t } from 'i18next'
import { z } from 'zod'
import {
    REQUEST_USER_INPUT_RESULT_PURPOSE_IMPLEMENTATION_CONFIRMATION,
    REQUEST_USER_INPUT_RESULT_PURPOSE_PLAN_CLARIFICATION,
    REQUEST_USER_INPUT_RESULT_TYPE,
    REQUEST_USER_INPUT_TOOL_NAME,
    type RequestUserInputParams,
    type RequestUserInputResult
} from '@xpert-ai/chatkit-types'
import type { ClientToolMessageResolver } from '../../xpert-middleware/client-tool.middleware'
import { PLAN_MODE_REQUEST_USER_INPUT_SCHEMA } from './plan-mode'

const validateQuestions = new Ajv({ strict: false }).compile<RequestUserInputParams>(
    PLAN_MODE_REQUEST_USER_INPUT_SCHEMA
)
const answerSchema = z.object({ id: z.string(), type: z.enum(['option', 'other']), value: z.string() })
const responseSchema = z.object({
    type: z.literal(REQUEST_USER_INPUT_RESULT_TYPE),
    requestId: z.string(),
    status: z.enum(['submitted', 'cancelled']),
    answers: z.unknown()
})

export function isPlanModeUserInput(value: unknown): value is RequestUserInputParams {
    return validateQuestions(value) && new Set(value.questions.map(({ id }) => id)).size === value.questions.length
}

function invalidInput() {
    return new Error(
        t('server-ai:UserInput.InvalidResponse', {
            defaultValue: 'The user input response is invalid. Please submit the requested fields again.'
        })
    )
}

export const resolvePlanModeUserInputMessage: ClientToolMessageResolver = (message, call) => {
    const params = call.args
    if (!isPlanModeUserInput(params)) throw invalidInput()
    let content: unknown = message.content
    if (typeof content === 'string') {
        try {
            content = JSON.parse(content)
        } catch {
            throw invalidInput()
        }
    }
    const parsed = responseSchema.safeParse(content)
    if (!parsed.success || parsed.data.requestId !== call.id) throw invalidInput()
    const response = parsed.data
    const result: RequestUserInputResult = {
        type: REQUEST_USER_INPUT_RESULT_TYPE,
        requestId: call.id,
        status: response.status,
        purpose:
            params.questions.length === 1 && params.questions[0].id === 'implement_plan'
                ? REQUEST_USER_INPUT_RESULT_PURPOSE_IMPLEMENTATION_CONFIRMATION
                : REQUEST_USER_INPUT_RESULT_PURPOSE_PLAN_CLARIFICATION,
        answers: []
    }
    if (response.status === 'submitted') {
        const answers = z.array(answerSchema).safeParse(response.answers)
        if (
            !answers.success ||
            answers.data.length !== params.questions.length ||
            new Set(answers.data.map(({ id }) => id)).size !== answers.data.length
        )
            throw invalidInput()
        result.answers = params.questions.map((question) => {
            const answer = answers.data.find(({ id }) => id === question.id)
            if (!answer) throw invalidInput()
            const option = question.options.find(({ label }) => label === answer.value)
            if (answer.type === 'option' && !option) throw invalidInput()
            return {
                id: question.id,
                question: question.question,
                type: answer.type,
                value: answer.value,
                ...(answer.type === 'option' ? { label: option.label, description: option.description } : {})
            }
        })
    }
    return { tool_call_id: call.id, name: REQUEST_USER_INPUT_TOOL_NAME, status: 'success', content: result }
}
