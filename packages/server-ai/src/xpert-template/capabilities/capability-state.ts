import { AssistantCapabilityState, IXpertAgent, normalizeMiddlewareNodes, TXpertTeamDraft } from '@xpert-ai/contracts'
import { ConflictException } from '@nestjs/common'
import { isEqual } from 'lodash'
import { t } from 'i18next'

export function primaryAgent(draft: TXpertTeamDraft) {
    const node = draft.nodes.find((node) => node.type === 'agent' && node.key === draft.team.agent?.key)
    if (node?.type !== 'agent') conflict()
    return node
}

function options(agent: IXpertAgent) {
    return { middlewares: agent.options?.middlewares, parallelToolCalls: agent.options?.parallelToolCalls }
}
function same(left: unknown, right: unknown): boolean {
    return isEqual(JSON.parse(JSON.stringify(left ?? null)), JSON.parse(JSON.stringify(right ?? null)))
}
function conflict(): never {
    throw new ConflictException(t('server-ai:Error.AssistantCapabilityConflict'))
}

export function recordCapabilityState(before: TXpertTeamDraft, after: TXpertTeamDraft, selected: string[]) {
    before.nodes = normalizeMiddlewareNodes(before.nodes)
    after.nodes = normalizeMiddlewareNodes(after.nodes)
    const source = primaryAgent(before)
    const primary = primaryAgent(after)
    const basePrompt = source.entity.prompt ?? ''
    const prompt = primary.entity.prompt ?? ''
    if (!prompt.startsWith(basePrompt)) conflict()
    const state: AssistantCapabilityState = {
        version: 1,
        selected: [...selected],
        agentKey: primary.key,
        instructions: prompt.slice(basePrompt.length),
        nodes: [],
        connections: []
    }
    for (const node of after.nodes) {
        if (node.key === primary.key) continue
        const old = before.nodes.find((entry) => entry.key === node.key)
        if (!same(old?.entity, node.entity)) state.nodes.push({ key: node.key, before: old, after: node })
    }
    for (const edge of after.connections) {
        const old = before.connections.find((entry) => entry.key === edge.key)
        if (!same(old, edge)) state.connections.push({ key: edge.key, before: old, after: edge })
    }
    if (!same(options(source.entity), options(primary.entity)))
        state.agentOptions = { before: options(source.entity), after: options(primary.entity) }
    if (!same(before.team.features?.sandbox, after.team.features?.sandbox))
        state.sandbox = { before: before.team.features?.sandbox, after: after.team.features?.sandbox }
    if (!same(before.team.features?.realtimeVoice, after.team.features?.realtimeVoice))
        state.realtimeVoice = { before: before.team.features?.realtimeVoice, after: after.team.features?.realtimeVoice }
    after.team.options = { ...after.team.options, assistantCapabilities: structuredClone(state) }
}

/** Fails closed if Studio changed an owned contribution; never erase unrelated graph nodes. */
export function removeCapabilityState(input: TXpertTeamDraft): TXpertTeamDraft {
    const draft = structuredClone(input)
    const state = draft.team.options?.assistantCapabilities
    if (!state) return draft
    if (state.version !== 1) conflict()
    const primary = primaryAgent(draft)
    if (primary.key !== state.agentKey) conflict()
    const prompt = primary.entity.prompt ?? ''
    if (state.instructions && !prompt.endsWith(state.instructions)) conflict()
    if (state.instructions) primary.entity.prompt = prompt.slice(0, -state.instructions.length)
    for (const change of state.nodes) {
        const index = draft.nodes.findIndex((node) => node.key === change.key)
        if (index < 0 || !same(draft.nodes[index].entity, change.after.entity)) conflict()
        if (change.before) draft.nodes[index] = { ...change.before, position: draft.nodes[index].position }
        else {
            if (
                draft.connections.some(
                    (edge) =>
                        (edge.from === change.key || edge.to === change.key) &&
                        !state.connections.some((owned) => owned.key === edge.key)
                )
            )
                conflict()
            draft.nodes.splice(index, 1)
        }
    }
    for (const change of state.connections) {
        const index = draft.connections.findIndex((edge) => edge.key === change.key)
        if (index < 0 || !same(draft.connections[index], change.after)) conflict()
        if (change.before) draft.connections[index] = change.before
        else draft.connections.splice(index, 1)
    }
    if (state.agentOptions) {
        if (!same(options(primary.entity), state.agentOptions.after)) conflict()
        primary.entity.options = {
            ...primary.entity.options,
            middlewares: state.agentOptions.before?.middlewares,
            parallelToolCalls: state.agentOptions.before?.parallelToolCalls
        }
    }
    if (state.sandbox) {
        if (!same(draft.team.features?.sandbox, state.sandbox.after)) conflict()
        draft.team.features = { ...draft.team.features, sandbox: state.sandbox.before }
    }
    if (state.realtimeVoice) {
        if (!same(draft.team.features?.realtimeVoice, state.realtimeVoice.after)) conflict()
        draft.team.features = { ...draft.team.features, realtimeVoice: state.realtimeVoice.before }
    }
    delete draft.team.options.assistantCapabilities
    return draft
}

export function updateAssistantPrompt(draft: TXpertTeamDraft, prompt: string) {
    const state = draft.team.options?.assistantCapabilities
    // Capability instructions remain managed separately from the user-editable system prompt.
    const instructions = state?.instructions.replace(/^\n+/, '') ?? ''
    const suffix = instructions ? `${prompt ? '\n\n' : ''}${instructions}` : ''
    primaryAgent(draft).entity.prompt = prompt + suffix
    if (state) state.instructions = suffix
}
