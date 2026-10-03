import type { ModelFeature } from '@xpert-ai/contracts'

/** Expand only when the host can validate the feature at every model invocation. */
export type ModelRequirementFeature = ModelFeature.VISION

/** Hard requirements for one model call, including retries and fallbacks. */
export interface ModelRequirements {
  readonly features?: readonly ModelRequirementFeature[]
}

/** Combine middleware contributions without mutating or weakening existing requirements. */
export function mergeModelRequirements(
  ...requirements: readonly (ModelRequirements | undefined)[]
): ModelRequirements | undefined {
  const features = [...new Set(requirements.flatMap((item) => item?.features ?? []))]
  return features.length ? { features } : undefined
}
