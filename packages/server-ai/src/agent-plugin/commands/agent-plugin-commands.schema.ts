import { z } from 'zod/v3'
import type { AgentPluginCommand } from '@xpert-ai/contracts'
import { runtimeResourcesSchema } from '../runtime-resource-selection'

export const resourceCommandsInputSchema = z
    .object({
        runtimeResources: runtimeResourcesSchema,
        projectId: z.string().uuid().optional()
    })
    .strict()

const key = z
    .string()
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const text = z.union([
    z.string().trim().min(1).max(1024),
    z
        .object({
            en_US: z.string().trim().min(1).max(1024),
            zh_Hans: z.string().trim().min(1).max(1024).optional(),
            zh_Hant: z.string().trim().min(1).max(1024).optional()
        })
        .strict()
])
const presentation = z
    .object({
        label: text.optional(),
        description: text.optional(),
        argsHint: z.string().max(500).optional()
    })
    .strict()
export const agentPluginCommandSchema = presentation
    .extend({
        subcommands: z
            .record(key, presentation)
            .refine((value) => Object.keys(value).length <= 50)
            .optional()
    })
    .strict()

/** Invalid shortcuts must not disable valid skills, templates, or other commands. */
export function parseAgentPluginCommands(
    input: unknown,
    skills: Array<{ key: string }>,
    report: (component: string, code: string, message: unknown) => void
): Record<string, AgentPluginCommand> {
    const result: Record<string, AgentPluginCommand> = {}
    const entries = z.record(z.unknown()).safeParse(input)
    if (!entries.success || Object.keys(entries.data).length > 100) {
        report('commands', 'invalid_commands', 'Commands must be a skill-keyed object with at most 100 entries')
        return result
    }
    for (const [name, meta] of Object.entries(entries.data)) {
        const parsed = agentPluginCommandSchema.safeParse(meta)
        if (!key.safeParse(name).success || !parsed.success) {
            report(`commands.${name}`, 'invalid_command', 'Invalid command presentation or subcommand name')
        } else if (!skills.some((skill) => skill.key === name)) {
            report(`commands.${name}`, 'command_skill_missing', 'Command must reference a valid skill in this package')
        } else {
            result[name] = parsed.data as AgentPluginCommand
        }
    }
    return result
}

export const resourceSkillsSchema = z
    .array(
        z
            .object({
                bindingId: z.string().uuid(),
                version: z.string().regex(/^[a-f0-9]{64}$/),
                skillKey: key
            })
            .strict()
    )
    .max(50)
    .refine(
        (refs) => new Set(refs.map((ref) => `${ref.bindingId}:${ref.version}:${ref.skillKey}`)).size === refs.length
    )
