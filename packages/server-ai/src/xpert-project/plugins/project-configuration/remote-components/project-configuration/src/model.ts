import { z } from 'zod'
/** Compact public projection; credentials and authoring Assistant graphs never enter the iframe. */
export const projectConfigurationOverviewSchema = z.object({
    projectId: z.string(),
    name: z.string(),
    userId: z.string(),
    canEdit: z.boolean(),
    canManage: z.boolean(),
    isOwner: z.boolean(),
    applicationManaged: z.boolean(),
    instruction: z.string(),
    effectiveMaxDurationSeconds: z.number(),
    tenantMaxDurationSeconds: z.number(),
    experts: z.array(z.object({ id: z.string(), name: z.string() })),
    members: z.array(
        z.object({ id: z.string(), name: z.string(), role: z.enum(['owner', 'manager', 'editor', 'member']) })
    ),
    skills: z.array(
        z.object({ id: z.string(), name: z.string(), description: z.string().optional(), enabled: z.boolean() })
    ),
    automations: z.array(z.object({ id: z.string(), name: z.string(), schedule: z.string(), status: z.string() })),
    automationTotal: z.number()
})
