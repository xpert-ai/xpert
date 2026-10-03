// Invariants: requirements accumulate within one middleware call chain. Each
// invocation snapshots its own requirements; retries and concurrent calls cannot weaken them.
import { ModelFeature } from '@xpert-ai/contracts'
import {
    mergeModelRequirements,
    type ModelRequirements,
    type WrapModelCallHandler,
    type WrapModelCallHook
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod'

const requirementsSchema = z.object({ features: z.array(z.literal(ModelFeature.VISION)).optional() }).strict()

/** Validate plugin input and detach it from mutable middleware-owned objects. */
export function snapshotModelRequirements(value: unknown): ModelRequirements | undefined {
    if (value === undefined) return undefined
    const parsed = requirementsSchema.safeParse(value)
    if (!parsed.success) {
        throw new Error(
            t('server-ai:Error.AgentModelRequirementsInvalid', {
                defaultValue: 'The model requirements are invalid or include a capability this host cannot validate.'
            })
        )
    }
    const normalized = mergeModelRequirements(parsed.data)
    return normalized ? Object.freeze({ features: Object.freeze([...(normalized.features ?? [])]) }) : undefined
}

export function withModelRequirements(hook: WrapModelCallHook, next: WrapModelCallHandler): WrapModelCallHandler {
    return (request) => {
        const inherited = snapshotModelRequirements(request.requirements)
        return hook({ ...request, requirements: inherited }, (updated) =>
            next({
                ...updated,
                requirements: snapshotModelRequirements(
                    mergeModelRequirements(inherited, snapshotModelRequirements(updated.requirements))
                )
            })
        )
    }
}
