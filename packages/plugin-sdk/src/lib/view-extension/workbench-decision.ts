import type { HumanDecisionInput, HumanDecisionResult } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core/runtime-capability'

/**
 * Lets a plugin's server-side View provider submit a human decision during an authorized
 * assistant or project workbench action. The host takes the actor and plugin identity from
 * the current action and routes the submission to their active source binding.
 * The event source checks who can decide the business matter and records the choice.
 */
export const WorkbenchDecisionCapability = createRuntimeCapability<{
  submit(adapter: string, sourceBindingRef: string, input: HumanDecisionInput): Promise<HumanDecisionResult>
}>('platform.view.workbench-decision')
