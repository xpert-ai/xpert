import { instanceToPlain } from 'class-transformer'
import { XpertDraftDslDTO } from './xpert-dsl.dto'

describe('XpertDraftDslDTO', () => {
    it('keeps copilot model identifiers in exported draft DSL', () => {
        const dto = new XpertDraftDslDTO({
            team: {
                name: 'Support Expert',
                type: 'agent',
                agent: {
                    key: 'Agent_1'
                },
                copilotModel: {
                    copilotId: 'copilot-openai',
                    referencedId: 'model-ref-1',
                    modelType: 'llm',
                    model: 'gpt-4.1'
                }
            } as any,
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_1',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_1',
                        name: 'Support Expert',
                        copilotModel: {
                            copilotId: 'copilot-openai',
                            referencedId: 'model-ref-2',
                            modelType: 'llm',
                            model: 'gpt-4.1'
                        }
                    }
                }
            ] as any,
            connections: []
        })

        expect(instanceToPlain(dto)).toMatchObject({
            team: {
                copilotModel: {
                    copilotId: 'copilot-openai',
                    referencedId: 'model-ref-1',
                    modelType: 'llm',
                    model: 'gpt-4.1'
                }
            },
            nodes: [
                {
                    entity: {
                        copilotModel: {
                            copilotId: 'copilot-openai',
                            referencedId: 'model-ref-2',
                            modelType: 'llm',
                            model: 'gpt-4.1'
                        }
                    }
                }
            ]
        })
    })
})
