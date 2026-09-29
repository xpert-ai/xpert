import type { TemplatePreflight } from '../catalog-types'
export type AssistantSettings =
  | { canEdit: false }
  | {
      canEdit: true
      revision: string
      workspace: { id: string; name: string }
      prompt: string
      modelId: string
      capabilities: string[]
      preflight: TemplatePreflight
    }
