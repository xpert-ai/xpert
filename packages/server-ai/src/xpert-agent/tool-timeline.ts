import { isToolActivity, previewToolValue } from '@xpert-ai/chatkit-types'
import type {
    ToolCallPresentation,
    ToolDetailPhase,
    ToolDetailReference,
    ToolValuePresentation
} from '@xpert-ai/chatkit-types'
import type { JSONValue, ToolDisplayDeclaration } from '@xpert-ai/contracts'

export type ToolTimelineIdentity = { executionId?: string; runId?: string; agentKey?: string }
export type ToolDetailWrite = {
    toolCallId: string
    executionId?: string
    phase: ToolDetailPhase
    format: 'text' | 'json'
    text: string
}
export type ToolDetailWriter = (input: ToolDetailWrite) => Promise<ToolDetailReference | undefined>

/** Only an owning tool can provide display callbacks; inherited metadata is not a declaration. */
export function readToolDisplay(value: unknown, tool: string | undefined): ToolDisplayDeclaration | undefined {
    if (!tool || !value || typeof value !== 'object' || !('tool' in value) || value.tool !== tool) return
    return {
        tool,
        ...('activity' in value && (typeof value.activity === 'function' || isToolActivity(value.activity))
            ? { activity: value.activity as ToolDisplayDeclaration['activity'] }
            : {}),
        ...('target' in value && typeof value.target === 'function'
            ? { target: value.target as ToolDisplayDeclaration['target'] }
            : {}),
        ...('outputSummary' in value && validSummary(value.outputSummary)
            ? { outputSummary: value.outputSummary }
            : {}),
        ...('outputMode' in value && (value.outputMode === 'summary' || value.outputMode === 'preview')
            ? { outputMode: value.outputMode }
            : {})
    }
}

function validSummary(value: unknown): value is ToolDisplayDeclaration['outputSummary'] {
    if (typeof value === 'string') return value.length <= 500
    return Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.entries(value).length <= 10 &&
        Object.entries(value).every(([key, text]) => key.length < 30 && typeof text === 'string' && text.length <= 500)
    )
}

type TimelineState = { presentation: ToolCallPresentation; declaration?: ToolDisplayDeclaration }

/** One state per execution/call/name; a later update cannot reinterpret the original activity. */
export class ToolTimelineProjection {
    private readonly calls = new Map<string, TimelineState>()

    constructor(private readonly write?: ToolDetailWriter) {}

    project(
        id: string,
        name: string | undefined,
        identity: ToolTimelineIdentity,
        declaration: unknown,
        fields: { input?: JSONValue; output?: JSONValue; error?: JSONValue },
        phases: readonly ToolDetailPhase[],
        options: { running?: boolean; withheld?: boolean; failed?: boolean } = {}
    ) {
        const key = JSON.stringify([identity.executionId ?? identity.agentKey ?? '', id, name])
        let state = this.calls.get(key)
        if (!state) {
            const display = readToolDisplay(declaration, name)
            let activity: unknown
            try {
                activity = typeof display?.activity === 'function' ? display.activity(fields.input) : display?.activity
            } catch {
                /* Display hints cannot fail execution. */
            }
            state = {
                declaration: display,
                presentation: { version: 1, ...(isToolActivity(activity) ? { activity } : {}) }
            }
            this.calls.set(key, state)
        }
        const presentation: ToolCallPresentation = { ...state.presentation }
        if (fields.input !== undefined && !presentation.target && state.declaration?.target) {
            try {
                const target = state.declaration.target(fields.input)
                if (typeof target === 'string' && target.trim()) presentation.target = target.trim().slice(0, 160)
            } catch {
                /* Keep generic details if a plugin's optional formatter fails. */
            }
        }
        const previews: { input?: JSONValue; output?: JSONValue; error?: JSONValue } = {}
        const writes: Promise<void>[] = []
        for (const phase of phases) {
            const value = fields[phase]
            if (value === undefined) {
                presentation[phase] = { state: options.withheld ? 'not-public' : 'unavailable', truncated: false }
                continue
            }
            const outputSuccess = phase === 'output' && !phases.includes('error') && !options.failed
            const result = previewToolValue(value, outputSuccess ? state.declaration?.outputMode : 'preview')
            if (result.preview !== undefined) previews[phase] = result.preview
            const view: ToolValuePresentation = {
                ...result.presentation,
                ...(outputSuccess && state.declaration?.outputSummary
                    ? { summary: state.declaration.outputSummary }
                    : {})
            }
            presentation[phase] = view
            const write = this.write
            if (view.truncated && write && (!options.running || phase === 'input')) {
                writes.push(
                    Promise.resolve()
                        .then(() =>
                            write({
                                toolCallId: id,
                                executionId: identity.executionId,
                                phase,
                                format: result.presentation.format!,
                                text: result.text
                            })
                        )
                        .then((detail) => {
                            if (detail) view.detail = detail
                        })
                        .catch(() => {
                            /* A missing detail never publishes raw content or fails the tool. */
                        })
                )
            }
        }
        state.presentation = presentation
        const result = { ...previews, presentation }
        return writes.length ? Promise.all(writes).then(() => result) : result
    }
}
