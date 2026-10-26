import type { ContentModelIdentity, ResourceContentEditorRegistration } from '@xpert-ai/contracts'

/** Matching semantic type alone never grants a writer access to an incompatible native model. */
export function supportsContentModel(
  editor: ResourceContentEditorRegistration,
  model: ContentModelIdentity,
  access: 'view' | 'edit'
) {
  return editor.supports.some(
    (item) =>
      item.typeId === model.typeId &&
      item.modelId === model.modelId &&
      item.schemaVersion === model.schemaVersion &&
      item.editProtocol.id === model.editProtocol.id &&
      item.editProtocol.version === model.editProtocol.version &&
      item.access.includes(access)
  )
}
