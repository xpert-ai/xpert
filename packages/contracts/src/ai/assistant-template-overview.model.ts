import type { AssistantCapabilitySummary } from './assistant-capability.model'
import type { AssistantOperationPolicy } from './assistant-template-setup.model'
import type { AssistantTemplateManifest } from './assistant-template-manifest.model'

/** Catalog content only: never installed Assistant memories, credentials or runtime bindings. */
export interface AssistantTemplateOverview {
  id: string
  title: string
  description: string
  publisher: string
  version?: string
  instructions: string
  memories: { title: string; content?: string }[]
  skills: AssistantCapabilitySummary['skills']
  agents: AssistantCapabilitySummary['agents']
  onboarding?: Required<NonNullable<AssistantTemplateManifest['onboarding']>>
  routines: Required<NonNullable<AssistantTemplateManifest['routines']>[number]>[]
  integrations: {
    key: string
    kind: 'connector' | 'mcp' | 'app' | 'toolset'
    label: string
    description: string
    required: boolean
    permissions: string[]
  }[]
  files?: {
    scope: 'shared' | 'user'
    paths: string[]
  }
  operationPolicy?: {
    default: NonNullable<AssistantOperationPolicy['default']>
    rules: { tool: string; decision: 'allow' | 'approve' | 'deny'; reason?: string }[]
  }
  application?: { appName: string; pluginName: string }
}
