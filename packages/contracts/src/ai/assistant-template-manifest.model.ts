import type { TemplateDependencyLock } from './template-installation.model'
import { z } from 'zod'
import { ModelFeature } from './ai-model.model'

const text = z.string().trim().min(1).max(300)
const key = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/)
const required = z.boolean().default(true)

/** Portable paths only. Volume remains responsible for canonical containment and symlink checks. */
export const templateFilePathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      // Control characters are intentionally rejected in untrusted template paths.
      // eslint-disable-next-line no-control-regex
      !/[\\:\x00-\x1f]/.test(value) &&
      value
        .split('/')
        .every(
          (part) =>
            !!part &&
            part !== '.' &&
            part !== '..' &&
            part.toLowerCase() !== '.apps' &&
            !part.toLowerCase().startsWith('.workspace-write-')
        )
  )

const fileEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('directory'), path: templateFilePathSchema }).strict(),
  z
    .object({
      kind: z.literal('file'),
      path: templateFilePathSchema,
      content: z.string().max(262144),
      contentVersion: text,
      policy: z.literal('create-only')
    })
    .strict(),
  z
    .object({
      kind: z.literal('ledger'),
      path: templateFilePathSchema.refine((path) => path.endsWith('.json')),
      structureVersion: text,
      columns: z
        .array(z.object({ key, label: text, type: z.enum(['string', 'number', 'boolean', 'date']) }).strict())
        .min(1)
        .max(64),
      policy: z.literal('create-only')
    })
    .strict()
])

export const templateFilesSchema = z
  .object({
    scope: z.enum(['shared', 'user']),
    entries: z.array(fileEntrySchema).min(1).max(100)
  })
  .strict()
  .superRefine(({ entries }, ctx) => {
    const paths = new Set<string>()
    for (const [index, entry] of entries.entries()) {
      const path = entry.path.toLowerCase()
      if (paths.has(path)) ctx.addIssue({ code: 'custom', path: ['entries', index, 'path'], message: 'Duplicate path' })
      paths.add(path)
      if (entries.some((other) => other.kind !== 'directory' && path.startsWith(`${other.path.toLowerCase()}/`)))
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'path'], message: 'File cannot be a parent' })
      if (entry.kind === 'ledger' && new Set(entry.columns.map((column) => column.key)).size !== entry.columns.length)
        ctx.addIssue({ code: 'custom', path: ['entries', index, 'columns'], message: 'Duplicate column' })
    }
    if (entries.reduce((size, entry) => size + (entry.kind === 'file' ? entry.content.length : 0), 0) > 1048576)
      ctx.addIssue({ code: 'custom', message: 'Initial content exceeds limit' })
  })

/** Versioned, credential-free declarations. Missing manifest preserves the legacy template contract. */
export const templateManifestV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    version: text,
    memory: z
      .object({ seed: z.boolean(), preferences: z.array(key).max(50).default([]) })
      .strict()
      .optional(),
    skills: z
      .array(z.object({ pluginName: text.optional(), componentKey: key }).strict())
      .max(100)
      .optional(),
    files: templateFilesSchema.optional(),
    onboarding: z
      .object({
        skill: key,
        required,
        preferences: z
          .array(key)
          .max(50)
          .refine((items) => new Set(items).size === items.length),
        completionCriteria: text
      })
      .strict()
      .optional(),
    connectors: z
      .array(z.object({ key, provider: text, required, purpose: text, permissions: z.array(text).max(50) }).strict())
      .max(50)
      .refine((items) => new Set(items.map((item) => item.key)).size === items.length)
      .refine((items) => new Set(items.map((item) => item.provider)).size === items.length)
      .optional(),
    routines: z
      .array(
        z
          .object({
            key,
            required: z.boolean().default(false),
            trigger: z.enum(['schedule', 'event']),
            expression: text,
            timezone: z.enum(['user', 'organization']),
            skill: key,
            output: text,
            enabled: z.literal(false).default(false)
          })
          .strict()
      )
      .max(50)
      .refine((items) => new Set(items.map((item) => item.key)).size === items.length)
      .optional(),
    execution: z
      .object({
        modelFeatures: z.array(z.nativeEnum(ModelFeature)).max(20).optional(),
        sandbox: z.enum(['server', 'cloud-computer']).optional(),
        localCapabilities: z.array(key).max(20).optional(),
        offline: z.enum(['requires-online', 'local-only']).optional()
      })
      .strict()
      .optional()
  })
  .strict()

/** V2 keeps only initialization and requirements that the DSL cannot express. */
export const assistantTemplateManifestSchema = templateManifestV1Schema
  .omit({ memory: true, skills: true, execution: true })
  .extend({
    schemaVersion: z.literal(2),
    execution: templateManifestV1Schema.shape.execution.unwrap().omit({ sandbox: true }).optional()
  })
  .strict()

export const templateManifestSchema = z.discriminatedUnion('schemaVersion', [
  templateManifestV1Schema,
  assistantTemplateManifestSchema
])
export type AssistantTemplateManifest = z.output<typeof assistantTemplateManifestSchema>
export type TemplateManifest = z.output<typeof templateManifestSchema>
export type TemplateFiles = z.output<typeof templateFilesSchema>

export interface TemplateRequirementCheck {
  kind:
    | 'manifest'
    | 'memory'
    | 'skills'
    | 'files'
    | 'onboarding'
    | 'connectors'
    | 'routines'
    | 'execution'
    | 'plugin'
    | 'resource'
  key: string
  required: boolean
  status: 'ready' | 'unsupported' | 'missing' | 'incompatible' | 'pending-configuration'
  message: string
  pluginName?: string
  version?: string
}

/** Public projection deliberately excludes initial file contents, DSL, credentials and filesystem roots. */
export interface TemplateReadiness {
  capabilities?: import('./assistant-capability.model').AssistantCapabilitySummary
  manifestVersion?: string
  legacy: boolean
  canInstall: boolean
  checks: TemplateRequirementCheck[]
  dependencies: TemplateDependencyLock[]
  files?: {
    scope: 'shared' | 'user'
    entries: { kind: 'directory' | 'file' | 'ledger'; path: string; version?: string }[]
  }
}
