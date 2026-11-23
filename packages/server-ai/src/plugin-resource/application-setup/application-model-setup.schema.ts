import { analyticsBindingObjectSchema, analyticsOptionsSchema, validateAnalyticsBinding } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { applicationSetupSchema } from './application-setup.schema'

const target = applicationSetupSchema.innerType().extend({ installationScope: z.literal('organization') })
const connection = target.extend({ integrationId: z.string().uuid() })
const model = connection.extend({ modelId: z.string().min(1).max(160), revision: z.number().int().nonnegative() })
const workspace = connection.extend({ workspaceId: z.string().uuid() })
const selection = workspace.extend({
    dataSourceId: z.string().uuid(),
    mode: z.string().min(1).max(64),
    userIds: z.array(z.string().uuid()).min(1).max(50),
    revision: z.number().int().nonnegative()
})
export const modelSetupSchema = z.discriminatedUnion('step', [
    connection.extend({ step: z.literal('bootstrap-workspaces') }).strict(),
    workspace.extend({ step: z.literal('bootstrap-sources') }).strict(),
    selection.extend({ step: z.literal('bootstrap-plan') }).strict(),
    selection.extend({ step: z.literal('bootstrap-apply'), receipt: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
    target.extend({ step: z.literal('connections') }).strict(),
    connection.extend({ step: z.literal('models') }).strict(),
    model.extend({ step: z.literal('preview') }).strict(),
    model.extend({ step: z.literal('confirm'), receipt: z.string().regex(/^[0-9a-f]{64}$/) }).strict()
])
export type ModelSetupInput = z.output<typeof modelSetupSchema>

const preparedBinding = analyticsBindingObjectSchema.omit({ source: true }).superRefine(validateAnalyticsBinding)
const cell = z.union([z.string().max(4000), z.number().finite(), z.boolean(), z.null()])
export const modelPreviewSchema = z
    .object({
        modelLabel: z.string().trim().min(1).max(500),
        options: analyticsOptionsSchema,
        queries: z
            .array(
                z
                    .object({
                        key: z.string().min(1).max(64),
                        binding: preparedBinding,
                        rowCount: z.number().int().positive().safe(),
                        sample: z.array(z.record(cell)).min(1).max(3)
                    })
                    .strict()
            )
            .min(1)
    })
    .strict()
