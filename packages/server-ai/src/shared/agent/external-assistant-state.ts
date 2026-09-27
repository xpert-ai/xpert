// Caller skill selections belong to its entry point, not to a published external Assistant.
// Keep shared task state, but let the callee's own middleware resolve its configured skills.
import { STATE_VARIABLE_HUMAN, TToolCall } from '@xpert-ai/contracts'
import { START } from '@langchain/langgraph'
import { AgentStateAnnotation } from './state'

const callerSkillFields = [
    'selectedSkillIds',
    'selectedSkillWorkspaceId',
    'disabledSkillIds',
    'skillSelectionMode'
] as const

function withoutCallerSkillSelection<T extends object>(value: T): Omit<T, (typeof callerSkillFields)[number]> {
    const copy = { ...value }
    for (const key of callerSkillFields) Reflect.deleteProperty(copy, key)
    return copy
}

/**
 * Build the input state for a native external Assistant without inheriting the
 * caller's runtime skill selection, which would override the callee's configured
 * skills and can leave its expected skill files unavailable.
 *
 * Delegated arguments override matching parent fields, and the human input is
 * rebuilt from those arguments. Removes selectedSkillIds, selectedSkillWorkspaceId,
 * disabledSkillIds and skillSelectionMode from the root, human input and START
 * state so fallback readers cannot recover a caller override. The same fields
 * are removed when supplied directly in the delegated arguments.
 *
 * Neither input is mutated. Copies are shallow: unrelated business context and
 * nested values remain shared. Skill loading and access checks are still handled
 * by the external Assistant's own middleware; this function only prepares state.
 *
 * @param state - Caller state carrying the shared task and project context.
 * @param args - External Assistant tool arguments, including its delegated input.
 * @returns Child state with delegated input and without caller skill overrides.
 */
export function externalAssistantState(state: typeof AgentStateAnnotation.State, args: TToolCall['args']) {
    const child = withoutCallerSkillSelection({
        ...state,
        ...args,
        [STATE_VARIABLE_HUMAN]: withoutCallerSkillSelection({ ...args })
    })
    const start = child[START]
    if (start && typeof start === 'object' && !Array.isArray(start)) {
        child[START] = withoutCallerSkillSelection(start)
    }
    return child
}
