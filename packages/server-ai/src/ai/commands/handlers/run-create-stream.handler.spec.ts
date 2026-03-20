import { validateRunCreateInput } from './run-create-stream.handler'

describe('validateRunCreateInput', () => {
    it('accepts send payloads', () => {
        const result = validateRunCreateInput({
            action: 'send',
            message: {
                input: { input: 'Hi' }
            },
            state: {
                human: {
                    input: 'Hi'
                }
            }
        })

        expect(result).toMatchObject({
            action: 'send',
            message: {
                input: { input: 'Hi' }
            },
            state: {
                human: {
                    input: 'Hi'
                }
            }
        })
    })

    it('accepts resume payloads', () => {
        const result = validateRunCreateInput({
            action: 'resume',
            conversationId: 'conversation-1',
            target: {
                aiMessageId: 'message-1',
                executionId: 'execution-1'
            },
            decision: {
                type: 'confirm'
            }
        })

        expect(result).toEqual({
            action: 'resume',
            conversationId: 'conversation-1',
            target: {
                aiMessageId: 'message-1',
                executionId: 'execution-1'
            },
            decision: {
                type: 'confirm'
            }
        })
    })

    it('rejects legacy payloads', () => {
        expect(() => validateRunCreateInput({ input: { input: 'Tell me a joke.' } })).toThrow()
    })

    it('rejects missing input', () => {
        expect(() => validateRunCreateInput({})).toThrow()
    })
})
