import { IXpertAgent, TXpertTeamDraft } from '@xpert-ai/contracts'
import { XpertAgentNodeValidator } from './agent-validator'

describe('XpertAgentNodeValidator', () => {
    const validator = new XpertAgentNodeValidator()

    it('returns a warning when file understanding is enabled with structured output', () => {
        const draft = createDraft({
            options: {
                structuredOutputMethod: 'jsonMode'
            }
        })

        expect(validator.handle({ draft })).toEqual([
            expect.objectContaining({
                node: 'agent-1',
                ruleCode: 'AGENT_STRUCTURED_OUTPUT_FILE_UNDERSTANDING_CONFLICT',
                field: 'options.fileUnderstanding.enabled',
                level: 'warning'
            })
        ])
    })

    it('does not warn when file understanding is explicitly disabled', () => {
        const draft = createDraft({
            options: {
                structuredOutputMethod: 'jsonMode',
                fileUnderstanding: {
                    enabled: false
                }
            }
        })

        expect(validator.handle({ draft })).toEqual([])
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
