import type { ChatGroupComposerInput } from '@xpert-ai/contracts'
import { z } from 'zod'
import { runtimeResourcesSchema } from '../agent-plugin/runtime-resource-selection'

const names = z.array(z.string().min(1).max(512)).max(100)
const capabilitySet = {
    skills: z.object({ workspaceId: z.string().optional(), ids: names }).strict(),
    plugins: z.object({ nodeKeys: names }).strict(),
    subAgents: z.object({ nodeKeys: names }).strict().optional(),
    connectors: z.object({ bindingIds: names }).strict().optional()
}
export const groupComposerSchema = z
    .object({
        participantId: z.string().uuid(),
        projectId: z.string().uuid().optional(),
        files: z
            .array(
                z
                    .object({
                        filePath: z.string().min(1).max(4096),
                        workspacePath: z.string().min(1).max(4096),
                        originalName: z.string().max(4096).optional(),
                        mimeType: z.string().max(255).optional(),
                        size: z.number().nonnegative().optional(),
                        purpose: z.literal('workspace')
                    })
                    .strict()
            )
            .max(30)
            .optional(),
        runtimeResources: runtimeResourcesSchema.optional(),
        runtimeCapabilities: z
            .object({
                mode: z.literal('allowlist'),
                ...capabilitySet,
                recommended: z.object(capabilitySet).strict().optional()
            })
            .strict()
            .optional()
    })
    .strict()
    .transform((value) => value as ChatGroupComposerInput)

export const composerScopeQuery = z.object({ projectId: z.string().uuid().optional() }).strict()
export const composerResourcesQuery = composerScopeQuery.extend({
    search: z.string().max(200).optional(),
    kind: z.enum(['agent_plugin', 'middleware', 'external_xpert']).optional(),
    offset: z.coerce.number().int().min(0).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(50)
})
export const composerProjectsQuery = z
    .object({
        xpertId: z.string().uuid(),
        applicationKey: z.string().max(200).optional(),
        projectTypeKey: z.string().max(200).optional(),
        search: z.string().max(200).optional(),
        unclassified: z.enum(['true', 'false']).optional(),
        status: z.enum(['active', 'archived', 'all']).optional(),
        skip: z.coerce.number().int().min(0).default(0),
        take: z.coerce.number().int().min(1).max(100).default(25)
    })
    .strict()
export const composerValidateSchema = composerScopeQuery.extend({ runtimeResources: runtimeResourcesSchema })
