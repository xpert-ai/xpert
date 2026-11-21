import type { A2UIComponentInstance, A2UIServerToClientMessage } from './protocol'

// Bound model-authored graphs before recursive normalization or rendering.
export function assertWidgetBudget(value: unknown): void {
    const pending = [{ value, depth: 0 }]
    let nodes = 0
    while (pending.length) {
        const item = pending.pop()!
        if (++nodes > 20000 || item.depth > 32) throw new Error('A2UI payload exceeds the node/depth limit.')
        if (typeof item.value === 'string' && item.value.length > 16384) throw new Error('A2UI string exceeds 16K.')
        if (item.value && typeof item.value === 'object') {
            for (const [key, child] of Object.entries(item.value)) {
                if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid A2UI object key.')
                pending.push({ value: child, depth: item.depth + 1 })
            }
        }
    }
    if (JSON.stringify(value).length > 262144) throw new Error('A2UI payload exceeds 256K.')
    if (Array.isArray(value) && value.length > 32) throw new Error('A2UI payload exceeds 32 messages.')
}

function references(component: A2UIComponentInstance): string[] {
    const result: string[] = []
    const visit = (value: unknown) => {
        if (!value || typeof value !== 'object') return
        for (const [key, child] of Object.entries(value)) {
            if ((key === 'child' || key === 'componentId') && typeof child === 'string') result.push(child)
            else if (key === 'explicitList' && Array.isArray(child)) {
                for (const id of child) if (typeof id === 'string') result.push(id)
            } else if (key !== 'action') visit(child)
        }
    }
    visit(component.component)
    return result
}

export function validateSurfaceGraph(messages: A2UIServerToClientMessage[]): void {
    const surfaces = new Set(
        messages.map(
            (message) =>
                (message.surfaceUpdate ?? message.beginRendering ?? message.dataModelUpdate ?? message.deleteSurface)
                    ?.surfaceId
        )
    )
    if (surfaces.size !== 1) throw new Error('Each Widget must contain one complete surface.')
    if (messages.some((message) => message.deleteSurface))
        throw new Error('A Widget must retain its complete surface snapshot.')
    const components = new Map(
        messages.flatMap((message) => message.surfaceUpdate?.components ?? []).map((item) => [item.id, item])
    )
    if (components.size > 300) throw new Error('A2UI surface exceeds 300 components.')
    const done = new Set<string>()
    const visit = (id: string, ancestors: Set<string>) => {
        if (ancestors.has(id) || ancestors.size > 32)
            throw new Error('A2UI component graph has a cycle or exceeds depth 32.')
        if (done.has(id)) return
        const component = components.get(id)
        if (!component) throw new Error(`A2UI child "${id}" does not reference an existing component id.`)
        const next = new Set(ancestors).add(id)
        for (const child of references(component)) visit(child, next)
        done.add(id)
    }
    for (const id of components.keys()) visit(id, new Set())
}

export function collectAgentActions(messages: A2UIServerToClientMessage[]): string[] {
    const names = new Set<string>()
    for (const message of messages) {
        for (const component of message.surfaceUpdate?.components ?? []) {
            const button = component.component?.Button
            if (!button || typeof button !== 'object' || !('action' in button)) continue
            const action = button.action
            if (!action || typeof action !== 'object' || !('name' in action) || typeof action.name !== 'string')
                continue
            if (!/^[a-zA-Z][\w.-]{0,79}$/.test(action.name)) throw new Error('Invalid A2UI action name.')
            names.add(action.name)
        }
    }
    return [...names]
}
