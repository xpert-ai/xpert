import { IXpertAgent, TXpertTeamDraft } from '@xpert-ai/contracts'
import { XpertAgentNodeValidator } from './agent-validator'

describe('XpertAgentNodeValidator', () => {
    const validator = new XpertAgentNodeValidator()

    it('returns a warning when file understanding is enabled with structured output', async () => {
        const draft = createDraft({
            options: {
                structuredOutputMethod: 'jsonMode'
            }
        })

        await expect(validator.handle({ draft })).resolves.toEqual([
            expect.objectContaining({
                node: 'agent-1',
                ruleCode: 'AGENT_STRUCTURED_OUTPUT_FILE_UNDERSTANDING_CONFLICT',
                field: 'options.fileUnderstanding.enabled',
                level: 'warning'
            })
        ])
    })

    it('does not warn when file understanding is explicitly disabled', async () => {
        const draft = createDraft({
            options: {
                structuredOutputMethod: 'jsonMode',
                fileUnderstanding: {
                    enabled: false
                }
            }
        })

        await expect(validator.handle({ draft })).resolves.toEqual([])
    })

    it('returns a warning when file understanding is enabled without an available embedding copilot', () => {
        const draft = createDraft({
            options: {
                fileUnderstanding: {
                    enabled: true
                }
            }
        })

        expect(validator.check(draft.nodes[0] as any, false)).toEqual([
            expect.objectContaining({
                node: 'agent-1',
                ruleCode: 'AGENT_FILE_UNDERSTANDING_EMBEDDING_UNAVAILABLE',
                field: 'options.fileUnderstanding.enabled',
                level: 'warning'
            })
        ])
    })

    it('does not warn about embedding when file understanding is disabled', () => {
        const draft = createDraft({
            options: {
                fileUnderstanding: {
                    enabled: false
                }
            }
        })

        expect(validator.check(draft.nodes[0] as any, false)).toEqual([])
    })

    function createDraft(agent: Partial<IXpertAgent>): TXpertTeamDraft {
        return {
            team: {},
            connections: [],
            nodes: [
                {
                    type: 'agent',
                    key: 'agent-1',
                    position: {
                        x: 0,
                        y: 0
                    },
                    entity: {
                        key: 'agent-1',
                        ...agent
                    } as IXpertAgent
                }
            ]
        }
    }
})
