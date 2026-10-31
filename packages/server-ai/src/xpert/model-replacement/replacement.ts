import {
    AiModelTypeEnum,
    ICopilotModel,
    IWFNClassifier,
    ModelReplacementInput,
    modelIdentitySchema,
    ParameterRule,
    sameModelIdentity,
    transitionModelParameters,
    TXpertTeamDraft,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { createHash } from 'crypto'

export function draftRevision(draft: TXpertTeamDraft) {
    return createHash('sha256').update(JSON.stringify(draft)).digest('hex')
}

function draftModelOwners(draft: TXpertTeamDraft): { owner: { copilotModel?: ICopilotModel }; path: string }[] {
    const owners: { owner: { copilotModel?: ICopilotModel }; path: string }[] = [{ owner: draft.team, path: 'team' }]
    if (draft.team.agent) owners.push({ owner: draft.team.agent, path: 'team.agent' })
    for (const node of draft.nodes) {
        if (node.readonly) continue
        if (node.type === 'agent') owners.push({ owner: node.entity, path: `agent:${node.key}` })
        if (node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.CLASSIFIER)
            owners.push({ owner: node.entity as IWFNClassifier, path: `classifier:${node.key}` })
    }
    return owners
}

export function referencedDraftModels(draft: TXpertTeamDraft) {
    return draftModelOwners(draft).flatMap(({ owner }) => {
        const model = owner.copilotModel
        if (!model || (model.modelType && model.modelType !== AiModelTypeEnum.LLM)) return []
        const identity = modelIdentitySchema.safeParse({
            copilotId: model.copilotId,
            model: model.model,
            modelType: AiModelTypeEnum.LLM
        })
        return identity.success ? [identity.data] : []
    })
}

/** Only owned draft fields are traversed. Referenced assistants and knowledge indexes are excluded. */
export function replaceDraftModels(draft: TXpertTeamDraft, input: ModelReplacementInput, rules: ParameterRule[]) {
    const next = structuredClone(draft)
    const changes: { path: string; parameters: ReturnType<typeof transitionModelParameters>['changes'] }[] = []
    const missing = new Set<string>()
    const replace = (owner: { copilotModel?: ICopilotModel }, path: string) => {
        const old = owner?.copilotModel
        if (!old || !sameModelIdentity({ ...old, modelType: old.modelType ?? AiModelTypeEnum.LLM }, input.source))
            return
        const result = transitionModelParameters(old.options, rules, input.policy)
        result.missing.forEach((name) => missing.add(`${path}.${name}`))
        changes.push({ path, parameters: result.changes })
        // Drop entity IDs and references: the target is a new binding, never a mutation of a shared model entity.
        owner.copilotModel = { ...input.target, options: result.options }
    }
    for (const { owner, path } of draftModelOwners(next)) replace(owner, path)
    return { draft: next, changes, missing: [...missing] }
}
