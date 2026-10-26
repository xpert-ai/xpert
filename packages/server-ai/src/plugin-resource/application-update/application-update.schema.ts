import { z } from 'zod/v3'
import { applicationDetailQuerySchema } from '../application-scope.schema'

export const applicationUpdateSchema = applicationDetailQuerySchema
    .extend({
        operationId: z.string().uuid(),
        resume: z.boolean().default(false)
    })
    .strict()
export type ApplicationUpdateInput = z.output<typeof applicationUpdateSchema>

const target = z.object({
    key: z.string(),
    id: z.string(),
    templateKey: z.string(),
    primaryAgentKey: z.string().optional(),
    version: z.string().nullable().optional(),
    externalRoleKeys: z.array(z.string()).optional(),
    requiredExternalConnections: z.number().optional()
})
const entry = z.object({
    id: z.string().nullable(),
    stage: z.enum(['pending', 'preparing', 'prepared', 'binding', 'publishing', 'published']),
    versionBefore: z.string().nullable(),
    environmentId: z.string().nullable(),
    stateHash: z.string().nullable(),
    templateHash: z.string(),
    preparingHash: z.string().nullable().optional(),
    bindingHash: z.string().optional(),
    graphHash: z.string().optional(),
    modelHash: z.string().optional(),
    version: z.string().optional()
})
export const suiteReceiptSchema = z.object({
    schemaVersion: z.literal('xpert-assistant-suite-release@1'),
    signature: z.string(),
    runId: z.string(),
    profile: z.string(),
    mode: z.enum(['create', 'refresh']),
    plugin: z.object({ name: z.string(), version: z.string() }),
    scope: z.object({ tenantId: z.string().nullable(), organizationId: z.string(), workspaceId: z.string() }),
    environmentOverride: z.string().optional(),
    entries: z.record(entry),
    retiredIds: z.array(z.string()),
    readyForTesting: z.boolean(),
    status: z.enum(['preparing', 'publishing', 'completed', 'failed']),
    roles: z.array(target).optional(),
    orchestrator: target.optional()
})
export type SuiteReceipt = z.output<typeof suiteReceiptSchema>
export const applicationReleaseSchema = z.object({
    operationId: z.string().uuid(),
    status: z.enum(['running', 'failed', 'completed']),
    updatedAt: z.string(),
    errorCode: z.enum(['UPDATE_FAILED']).nullable(),
    receipt: suiteReceiptSchema.nullable()
})
export type ApplicationRelease = z.output<typeof applicationReleaseSchema>
