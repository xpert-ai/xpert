import { z } from 'zod'
import { BadRequestException } from '@nestjs/common'
import { integrationMessage } from './messages'

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)
const schema = z
  .object({
    appName: optionalText,
    appSlug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]*$/)
      .optional(),
    appId: z.string().regex(/^\d+$/).optional(),
    clientId: optionalText,
    clientSecret: optionalText,
    privateKey: optionalText,
    webhookSecret: z.string().min(32).optional()
  })
  .strict()
const patchSchema = schema.partial().extend({ appSlug: optionalText, appId: optionalText, webhookSecret: optionalText })

/** Empty secret inputs retain saved credentials during non-secret edits. */
export function mergeGitHubIntegrationOptions(previous: unknown, patch: unknown) {
  const current = parseOptions(patchSchema, previous ?? {})
  const changes = parseOptions(patchSchema, patch ?? {})
  const merged = { ...current, ...changes }
  for (const field of ['clientSecret', 'privateKey', 'webhookSecret'] as const) {
    if (!changes[field]?.trim()) merged[field] = current[field]
  }
  if (!merged.appId?.trim()) delete merged.appId
  if (!merged.appSlug?.trim()) delete merged.appSlug
  if (!merged.webhookSecret?.trim()) delete merged.webhookSecret
  return parseOptions(schema, merged)
}

function parseOptions<T extends z.ZodTypeAny>(validator: T, input: unknown): z.output<T> {
  const result = validator.safeParse(input)
  if (!result.success) throw new BadRequestException(integrationMessage('invalidOptions'))
  return result.data
}
