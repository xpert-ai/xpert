import type { XpertTemplateModelOption } from '@xpert-ai/contracts'

export type ModelOption = XpertTemplateModelOption

export function providerGroups(models: ModelOption[]) {
  const groups = new Map<string, { id: string; label: string; models: ModelOption[] }>()
  for (const model of models) {
    const id = model.provider?.id ?? ''
    let group = groups.get(id)
    if (!group) {
      group = { id, label: model.provider?.label ?? '', models: [] }
      groups.set(id, group)
    }
    group.models.push(model)
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function matchesModel(model: ModelOption, query: string) {
  const text = [model.label, model.copilotModel.model, model.provider?.label, model.provider?.id, model.connectionName]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase()
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .every((word) => text.includes(word))
}

export function isComputerModel(model: ModelOption) {
  const features = new Set<string>(model.features)
  return features.has('vision') && (features.has('tool-call') || features.has('multi-tool-call'))
}

export function rankModels(models: ModelOption[], computer: boolean, defaultModelId?: string) {
  return [...models].sort(
    (a, b) =>
      (computer ? Number(isComputerModel(b)) - Number(isComputerModel(a)) : 0) ||
      Number(b.id === defaultModelId) - Number(a.id === defaultModelId) ||
      a.label.localeCompare(b.label)
  )
}

export function modelTags(model: ModelOption): { key: string; label: string; value?: string }[] {
  const features = new Set<string>(model.features)
  const tags: { key: string; label: string; value?: string }[] = []
  if (model.contextWindow)
    tags.push({ key: 'context', label: '{{size}} context', value: formatContext(model.contextWindow) })
  if (features.has('vision')) tags.push({ key: 'vision', label: 'Vision' })
  if (features.has('multi-tool-call')) tags.push({ key: 'tools', label: 'Parallel tools' })
  else if (features.has('tool-call')) tags.push({ key: 'tools', label: 'Tool calling' })
  if (features.has('agent-thought')) tags.push({ key: 'reasoning', label: 'Reasoning' })
  if (features.has('structured-output')) tags.push({ key: 'structured', label: 'Structured output' })
  if (features.has('video')) tags.push({ key: 'video', label: 'Video' })
  if (features.has('stream-tool-call')) tags.push({ key: 'streaming', label: 'Streaming tools' })
  return tags
}

function formatContext(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`
  return String(value)
}
