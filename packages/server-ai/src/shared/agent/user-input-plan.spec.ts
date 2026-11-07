import type { ToolCall } from '@langchain/core/messages/tool'
import type { ClientToolMessageInput, RequestUserInputParams } from '@xpert-ai/chatkit-types'
import { resolveUserInputMessage } from './user-input'

const params: RequestUserInputParams = {
    questions: [
        {
            id: 'scope',
            header: 'Scope',
            question: 'Which scope?',
            options: [
                { label: 'Primary', description: 'Primary Agent' },
                { label: 'All', description: 'All Agents' }
            ]
        }
    ]
}
const call: ToolCall = { id: 'plan-question', name: 'request_user_input', args: params }
const execute = jest.fn()
function response(overrides: object = {}): ClientToolMessageInput {
    return {
        content: {
            type: 'request_user_input_result',
            requestId: call.id,
            status: 'submitted',
            purpose: 'implementation_confirmation',
            answers: [{ id: 'scope', type: 'option', value: 'Primary' }],
            ...overrides
        }
    }
}

describe('Plan Mode user input results', () => {
    it('derives clarification purpose and question text from the request rather than client metadata', () => {
        expect(resolveUserInputMessage(response(), call, execute)).toMatchObject({
            content: {
                purpose: 'plan_clarification',
                answers: [
                    {
                        id: 'scope',
                        question: 'Which scope?',
                        type: 'option',
                        value: 'Primary',
                        label: 'Primary',
                        description: 'Primary Agent'
                    }
                ]
            }
        })
    })

    it.each([
        { requestId: 'another-question' },
        { status: 'approved' },
        { answers: [] },
        { answers: [{ id: 'unknown', type: 'option', value: 'Primary' }] },
        { answers: [{ id: 'scope', type: 'option', value: 'Not an option' }] },
        {
            answers: [
                { id: 'scope', type: 'option', value: 'Primary' },
                { id: 'scope', type: 'option', value: 'All' }
            ]
        }
    ])('rejects invalid or mismatched results: %j', (override) => {
        expect(() => resolveUserInputMessage(response(override), call, execute)).toThrow()
    })

    it('retains free-text answers with their explicit answer type', () => {
        expect(
            resolveUserInputMessage(
                response({ answers: [{ id: 'scope', type: 'other', value: 'Only staging' }] }),
                call,
                execute
            )
        ).toMatchObject({
            content: { purpose: 'plan_clarification', answers: [{ type: 'other', value: 'Only staging' }] }
        })
    })

    it.each(['submitted', 'cancelled'] as const)(
        'retains implementation confirmation with explicit %s status',
        (status) => {
            const confirmation: ToolCall = {
                ...call,
                args: {
                    questions: [
                        {
                            id: 'implement_plan',
                            header: 'Confirm',
                            question: 'Implement this plan?',
                            options: [
                                { label: 'Yes, implement this plan', description: 'Proceed' },
                                { label: 'No, stop here', description: 'Stop' }
                            ]
                        }
                    ]
                }
            }
            expect(
                resolveUserInputMessage(
                    response({
                        status,
                        purpose: 'clarification',
                        answers: [{ id: 'implement_plan', type: 'option', value: 'Yes, implement this plan' }]
                    }),
                    confirmation,
                    execute
                )
            ).toMatchObject({
                content: {
                    status,
                    purpose: 'implementation_confirmation',
                    answers:
                        status === 'cancelled'
                            ? []
                            : [expect.objectContaining({ id: 'implement_plan', value: 'Yes, implement this plan' })]
                }
            })
        }
    )
})
