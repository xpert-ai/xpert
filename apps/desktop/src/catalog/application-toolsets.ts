import type { ApplicationToolsetRequirement, ApplicationToolsetSelection } from '../catalog-types'

export function reconcileApplicationToolsets(
  requirements: ApplicationToolsetRequirement[],
  previous: ApplicationToolsetSelection[]
) {
  return requirements.flatMap((requirement) => {
    const id = requirement.configuredToolsetId ?? previous.find((item) => item.key === requirement.key)?.toolsetId
    return id && requirement.options.some((option) => option.id === id) ? [{ key: requirement.key, toolsetId: id }] : []
  })
}

export function applicationToolsetsSelected(
  requirements: ApplicationToolsetRequirement[],
  selections: ApplicationToolsetSelection[]
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
