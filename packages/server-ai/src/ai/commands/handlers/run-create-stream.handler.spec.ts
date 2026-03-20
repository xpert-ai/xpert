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

    it('accepts legacy send payloads and normalizes them to v2', () => {
        const result = validateRunCreateInput({
            id: 'client-message-1',
            conversationId: 'conversation-1',
            projectId: 'project-1',
            environmentId: 'environment-1',
            sandboxEnvironmentId: 'sandbox-1',
            input: { input: 'Tell me a joke.' },
            state: {
                human: {
                    input: 'Tell me a joke.'
                }
            }
        })

        expect(result).toEqual({
            action: 'send',
            conversationId: 'conversation-1',
            projectId: 'project-1',
            environmentId: 'environment-1',
            sandboxEnvironmentId: 'sandbox-1',
            message: {
                clientMessageId: 'client-message-1',
                input: { input: 'Tell me a joke.' }
            },
            state: {
                human: {
                    input: 'Tell me a joke.'
                }
            }
        })
    })

    it('accepts legacy resume payloads and normalizes them to v2', () => {
        const result = validateRunCreateInput({
            conversationId: 'conversation-1',
            id: 'message-1',
            executionId: 'execution-1',
            confirm: true,
            command: {
                resume: {
                    approved: true
                },
                toolCalls: [{ id: 'call-1', args: { name: 'updated' } }],
                update: {
                    status: 'patched'
                },
                agentKey: 'agent-1'
            },
            state: {
                human: {
                    input: 'Continue'
                }
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
                type: 'confirm',
                payload: {
                    approved: true
                }
            },
            patch: {
                agentKey: 'agent-1',
                toolCalls: [{ id: 'call-1', args: { name: 'updated' } }],
                update: {
                    status: 'patched'
                }
            },
            state: {
                human: {
                    input: 'Continue'
                }
            }
        })
    })

    it('accepts legacy retry payloads and normalizes them to v2', () => {
        const result = validateRunCreateInput({
            conversationId: 'conversation-1',
            id: 'message-1',
            executionId: 'execution-1',
            retry: true,
            environmentId: 'environment-1',
            sandboxEnvironmentId: 'sandbox-1',
            input: { input: 'Retry this' }
        })

        expect(result).toEqual({
            action: 'retry',
            conversationId: 'conversation-1',
            source: {
                aiMessageId: 'message-1',
                executionId: 'execution-1'
            },
            environmentId: 'environment-1',
            sandboxEnvironmentId: 'sandbox-1'
        })
    })

    it('rejects missing input', () => {
        expect(() => validateRunCreateInput({})).toThrow()
    })
})
