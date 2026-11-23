import { z } from 'zod/v3'
import { analyticsBindingSchema } from '@xpert-ai/plugin-sdk'
import type { OrganizationApplicationSettings } from '@xpert-ai/contracts'
import { applicationSetupSchema } from './application-setup.schema'

const key = z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/)
    .refine((k) => !['constructor', 'prototype', '__proto__'].includes(k))
export const organizationSettingsSchema = z
    .object({
        revision: z.number().int().nonnegative(),
        members: z.record(
            key,
            z
                .array(z.string().uuid())
                .max(100)
                .refine((ids) => new Set(ids).size === ids.length)
        ),
        queries: z.record(key, analyticsBindingSchema)
    })
    .strict()
    .transform(
        (v): OrganizationApplicationSettings => ({ revision: v.revision, members: v.members, queries: v.queries })
    )

export const saveOrganizationSettingsSchema = applicationSetupSchema
    .innerType()
    .extend({
        organizationSettings: organizationSettingsSchema
    })
    .strict()
