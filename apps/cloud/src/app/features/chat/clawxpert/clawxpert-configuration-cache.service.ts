import { DOCUMENT } from '@angular/common'
import { inject, Injectable } from '@angular/core'
import {
  AiModelTypeEnum,
  AssistantBindingScope,
  AssistantCode,
  IAssistantBinding,
  IXpert,
  XpertTypeEnum,
  XpertWorkbenchInitialLayoutEnum
} from '@xpert-ai/contracts'
import { z } from 'zod'

export type ClawXpertConfigurationScope = { userId: string | null; organizationId: string | null }

const optionalString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)
const avatarSchema = z.object({
  emoji: z
    .object({
      id: z.string(),
      set: z.enum(['', 'apple', 'google', 'twitter', 'facebook']).optional(),
      colons: optionalString,
      unified: optionalString
    })
    .optional(),
  useNotoColor: z.boolean().optional(),
  background: optionalString,
  url: optionalString
})

// Persist only startup presentation data, never drafts, graphs, credentials or conversations.
const snapshotSchema = z
  .object({
    version: z.literal(1),
    preference: z.object({
      id: optionalString,
      code: z.literal(AssistantCode.CLAWXPERT),
      scope: z.literal(AssistantBindingScope.USER),
      assistantId: z.string().min(1),
      createdAt: z.coerce.date().optional()
    }),
    xpert: z.object({
      id: z.string().min(1),
      name: z.string(),
      slug: z.string(),
      type: z.literal(XpertTypeEnum.Agent),
      latest: z.literal(true).optional(),
      title: optionalString,
      titleCN: optionalString,
      description: optionalString,
      workspaceId: optionalString,
      avatar: avatarSchema.nullish().transform((value) => value ?? undefined),
      starters: z
        .array(z.string())
        .nullish()
        .transform((value) => value ?? undefined),
      features: z
        .object({
          opener: z.object({ enabled: z.boolean(), message: z.string(), questions: z.array(z.string()) }).optional(),
          frequentQuestions: z.object({ enabled: z.boolean() }).optional()
        })
        .nullish()
        .transform((value) => value ?? undefined),
      copilotModelId: optionalString,
      copilotModel: z
        .object({
          id: optionalString,
          copilotId: optionalString,
          referencedId: optionalString,
          model: optionalString,
          modelType: z.nativeEnum(AiModelTypeEnum).optional()
        })
        .nullish()
        .transform((value) => value ?? undefined),
      options: z
        .object({
          workbench: z
            .object({
              initialLayout: z.nativeEnum(XpertWorkbenchInitialLayoutEnum).optional(),
              defaultViewKey: optionalString
            })
            .nullish()
            .transform((value) => value ?? undefined),
          workspaceScope: z
            .object({
              mode: z.enum(['project-required', 'project-preferred']),
              projectType: z.object({ applicationKey: z.string(), projectTypeKey: z.string() }).optional()
            })
            .optional()
        })
        .nullish()
        .transform((value) => value ?? undefined)
    })
  })
  .refine((value) => value.preference.assistantId === value.xpert.id)

export type ClawXpertConfigurationSnapshot = {
  version: 1
  preference: IAssistantBinding
  xpert: IXpert
}

export function getClawXpertConfigurationCacheKey(scope: ClawXpertConfigurationScope): string | null {
  const userId = scope.userId?.trim()
  const organizationId = scope.organizationId?.trim()
  return userId && organizationId
    ? `xpert.clawxpert.configuration.v1:${encodeURIComponent(userId)}:${encodeURIComponent(organizationId)}`
    : null
}

@Injectable({ providedIn: 'root' })
export class ClawXpertConfigurationCache {
  readonly #document = inject(DOCUMENT)

  load(scope: ClawXpertConfigurationScope): ClawXpertConfigurationSnapshot | null {
    const key = getClawXpertConfigurationCacheKey(scope)
    if (!key) return null
    try {
      const raw = this.#document.defaultView?.localStorage.getItem(key)
      if (!raw) return null
      const result = snapshotSchema.safeParse(JSON.parse(raw))
      // Zod infers required keys as optional with this app's strictNullChecks disabled.
      if (result.success) return result.data as ClawXpertConfigurationSnapshot
      this.remove(scope)
    } catch {
      this.remove(scope)
    }
    return null
  }

  save(scope: ClawXpertConfigurationScope, preference: IAssistantBinding | null, xperts: IXpert[]): void {
    const key = getClawXpertConfigurationCacheKey(scope)
    if (!key) return
    const xpert = xperts.find((item) => item.id === preference?.assistantId)
    const result = snapshotSchema.safeParse({ version: 1, preference, xpert })
    if (!result.success) {
      this.remove(scope)
      return
    }
    try {
      this.#document.defaultView?.localStorage.setItem(key, JSON.stringify(result.data))
    } catch {
      // Storage may be disabled or full; the live configuration remains usable.
      this.remove(scope)
    }
  }

  remove(scope: ClawXpertConfigurationScope): void {
    const key = getClawXpertConfigurationCacheKey(scope)
    if (!key) return
    try {
      this.#document.defaultView?.localStorage.removeItem(key)
    } catch {
      // Cache availability must never prevent normal server loading.
    }
  }
}
