import { AiModelTypeEnum, ModelReplacementInput, ParameterType, TXpertTeamDraft } from '@xpert-ai/contracts'
import { draftRevision, referencedDraftModels, replaceDraftModels } from './replacement'

describe('draft model replacement', () => {
    const source = { copilotId: 'source', model: 'same', modelType: AiModelTypeEnum.LLM as const }
    const input: ModelReplacementInput = { source, target: { ...source, copilotId: 'target' }, policy: 'reset' }
    const draft: TXpertTeamDraft = {
        team: { copilotModel: { ...source, id: 'old-model-entity', options: { temperature: 0.9, old: 1 } } },
        nodes: [],
        connections: []
    }
    it('updates exact identities without mutating the original or carrying entity IDs', () => {
        const result = replaceDraftModels(draft, input, [
            { label: { en_US: 'Parameter' }, name: 'temperature', type: ParameterType.FLOAT, default: 0.2 }
        ])
        expect(result.changes).toHaveLength(1)
        expect(result.draft.team.copilotModel).toEqual({ ...input.target, options: { temperature: 0.2 } })
        expect(draft.team.copilotModel.id).toBe('old-model-entity')
        expect(draftRevision(result.draft)).not.toBe(draftRevision(draft))
    })
    it('does not match a same-name model from a different connection', () => {
        expect(replaceDraftModels(draft, { ...input, source: { ...source, copilotId: 'other' } }, []).changes).toEqual(
            []
        )
    })
    it('reports required parameters before a draft can be saved', () => {
        expect(
            replaceDraftModels(draft, input, [
                { label: { en_US: 'Parameter' }, name: 'required', type: ParameterType.STRING, required: true }
            ]).missing
        ).toEqual(['team.required'])
    })
    it('extracts a retired source from owned drafts without requiring it in the live catalog', () => {
        const binding = { ...source, copilotId: '7e68b923-d03e-4467-96e6-0a4ec395e2ac' }
        const sourceDraft: TXpertTeamDraft = {
            team: { copilotModel: binding },
            nodes: [
                {
                    type: 'agent',
                    key: 'readonly',
                    readonly: true,
                    position: { x: 0, y: 0 },
                    entity: { key: 'external', copilotModel: { ...binding, model: 'external' } }
                }
            ],
            connections: []
        }
        expect(referencedDraftModels(sourceDraft)).toEqual([binding])
    })
})
