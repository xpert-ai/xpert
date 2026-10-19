import { z } from 'zod'

import type { TAvatar } from '../types'
import type { TCopilotModel } from './copilot-model.model'
import type { RealtimeVoiceSelection } from './realtime-voice.model'

/** Reuse a key only for the same installation intent; a new key creates another Assistant. */
export interface TemplateInstallationInput {
  idempotencyKey: string
  templateId: string
  workspaceId: string
  publish?: boolean
  locale?: string
  capabilities?: string[]
  basic?: {
    name?: string
    title?: string
    description?: string
    prompt?: string
    avatar?: Omit<TAvatar, 'appearance'>
    copilotModel?: Pick<TCopilotModel, 'copilotId' | 'model' | 'modelType' | 'options'>
    workspaceDataScope?: 'shared' | 'user'
    realtimeVoice?: RealtimeVoiceSelection
  }
}

export type TemplateInstallationStage = 'importing' | 'dependencies' | 'publishing' | 'initializing' | 'completed'
export type TemplateInstallationStatus = 'running' | 'interrupted' | 'failed' | 'succeeded'

/** Public receipt, deliberately excluding stored input, source content and runtime errors. */
export interface TemplateInstallation {
  dependencyLocks?: TemplateDependencyLock[]
  id: string
  templateId: string
  workspaceId: string
  status: TemplateInstallationStatus
  stage: TemplateInstallationStage
  attempt: number
  assistantId: string | null
  publish: boolean
  retryable: boolean
  error: { code: 'INSTALL_FAILED' | 'SOURCE_CHANGED'; message: string } | null
  resourceInstallationIds: string[]
  pendingAuthInstallationIds: string[]
  createdAt: string
  updatedAt: string
}

export const templateDependencyVersionsSchema = z
  .array(z.object({ pluginName: z.string().min(1).max(214), version: z.string().min(1).max(100) }).strict())
  .max(100)

export const templateDependencyLocksSchema = z
  .array(
    z
      .object({
        pluginName: z.string().trim().min(1).max(300),
        version: z.string().trim().min(1).max(300),
        /** Explicit template requirement, distinct from the automatically recorded installation version. */
        requiredVersion: z.string().trim().min(1).max(300).optional(),
        source: z
          .object({
            kind: z.literal('agent-plugin'),
            name: z.string().min(1).max(300),
            digest: z.string().regex(/^[a-f0-9]{64}$/),
            bindingId: z.string().uuid(),
            bindingVersion: z.string().min(1).max(300)
          })
          .strict()
          .optional(),
        providers: z
          .array(
            z.object({ kind: z.enum(['middleware', 'sandbox', 'toolset']), key: z.string().min(1).max(300) }).strict()
          )
          .max(300)
          .optional(),
        components: z
          .array(
            z
              .object({
                type: z.enum(['skill', 'mcp_server', 'toolset', 'app', 'hook', 'asset']),
                key: z.string().min(1).max(128),
                hash: z.string().min(1).max(300)
              })
              .strict()
          )
          .max(300)
      })
      .strict()
  )
  .max(200)
export type TemplateDependencyLock = z.output<typeof templateDependencyLocksSchema>[number]

/** Advisory drift in an available runtime dependency; never a compatibility guarantee. */
export interface TemplateDependencyUpdate {
  pluginName: string
  installedVersion: string
  currentVersion: string
  changedComponents: { type: TemplateDependencyLock['components'][number]['type']; key: string }[]
}

export interface TemplateRuntimeDependencyReport {
  updates: TemplateDependencyUpdate[]
}
