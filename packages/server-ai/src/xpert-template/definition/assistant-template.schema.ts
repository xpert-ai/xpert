import { assistantTemplateManifestSchema, AssistantTemplateDependencies } from '@xpert-ai/contracts'
import { z } from 'zod'

const text = z.string().trim().min(1).max(300)
const selector = z.object({ pluginName: text.optional(), componentKey: text, targetAgentKey: text.optional() }).strict()
const approval = z.enum(['prompt', 'approve', 'deny'])
const policy = z
    .object({
        enabled: z.boolean().optional(),
        defaultToolsApprovalMode: approval.optional(),
        enabledTools: z.array(text).max(300).optional(),
        tools: z.record(z.object({ approvalMode: approval.optional() }).strict()).optional(),
        runtime: z
            .object({
                provider: text.optional(),
                startupTimeoutMs: z.number().nonnegative().optional(),
                idleTimeoutMs: z.number().nonnegative().optional(),
                maxLifetimeMs: z.number().nonnegative().optional(),
                allowedCommands: z.array(text).max(100).optional()
            })
            .strict()
            .optional()
    })
    .strict()
export const assistantTemplateDependenciesSchema = z
    .object({
        plugins: z.array(text).max(100).optional(),
        versions: z
            .array(z.object({ pluginName: text, version: text }).strict())
            .max(100)
            .optional(),
        skills: z.array(selector).max(100).optional(),
        mcpServers: z
            .array(selector.extend({ policyOverrides: policy.optional() }))
            .max(100)
            .optional(),
        hooks: z
            .array(selector.extend({ events: z.array(text).max(100).optional() }))
            .max(100)
            .optional(),
        apps: z
            .array(
                z
                    .object({
                        pluginName: text.optional(),
                        componentKey: text,
                        auth: z.enum(['on_install', 'on_first_use']).optional()
                    })
                    .strict()
            )
            .max(100)
            .optional(),
        toolsets: z
            .array(
                z
                    .object({
                        pluginName: text.optional(),
                        provider: text,
                        templateNodeKey: text,
                        targetAgentKey: text.optional(),
                        instanceName: text.optional()
                    })
                    .strict()
            )
            .max(100)
            .optional()
    })
    .strict()
export const assistantTemplateMetadataSchema = z
    .object({
        schemaVersion: z.literal(2),
        dependencies: assistantTemplateDependenciesSchema.optional(),
        manifest: assistantTemplateManifestSchema.optional()
    })
    .strict()

/** Schemas validate unknown persisted/HTTP input; explicit outputs bridge non-strict host TS inference. */
export function parseAssistantTemplateDependencies(value: unknown): AssistantTemplateDependencies {
    return assistantTemplateDependenciesSchema.parse(value) as AssistantTemplateDependencies
}
export function parseAssistantTemplateMetadata(
    value: unknown
): import('@xpert-ai/contracts').AssistantTemplateMetadata {
    const parsed = assistantTemplateMetadataSchema.parse(value)
    return {
        schemaVersion: 2,
        ...(parsed.manifest ? { manifest: parsed.manifest } : {}),
        ...(parsed.dependencies ? { dependencies: parseAssistantTemplateDependencies(parsed.dependencies) } : {})
    }
}
