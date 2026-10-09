import type { PluginApplicationToolsetRequirement, PluginApplicationToolsetSelection } from '@xpert-ai/contracts'

/** Refresh choices without losing a still-authorized selection; new configurations require an explicit choice. */
export function reconcileApplicationToolsets(
  requirements: PluginApplicationToolsetRequirement[],
  previous: PluginApplicationToolsetSelection[]
) {
  return requirements.flatMap((requirement) => {
    const id = requirement.configuredToolsetId ?? previous.find((item) => item.key === requirement.key)?.toolsetId
    return id && requirement.options.some((option) => option.id === id) ? [{ key: requirement.key, toolsetId: id }] : []
  })
}

export function applicationToolsetsSelected(
  requirements: PluginApplicationToolsetRequirement[],
  selections: PluginApplicationToolsetSelection[]
) {
  return requirements.every(
    (requirement) =>
      requirement.providerAvailable &&
      requirement.options.some(
        (option) =>
          option.id ===
          (requirement.configuredToolsetId ?? selections.find((item) => item.key === requirement.key)?.toolsetId)
      )
  )
}
