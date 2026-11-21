import { z } from 'zod/v3'

const localizedText = z.union([z.string(), z.record(z.string().optional())])

// Command provenance describes the user's shortcut; it never supplies executable configuration.
export const runtimeCommandSourceSchema = z
    .object({
        type: z.literal('slash_command'),
        name: z.string().min(1),
        source: z.enum(['builtin', 'host', 'runtime']),
        executionType: z.enum([
            'insert_text',
            'insert_invocation',
            'submit_prompt',
            'client_action',
            'select_capability'
        ]),
        kind: z.enum(['command', 'prompt_workflow']).optional(),
        workflow: z
            .object({
                type: z.literal('prompt_workflow'),
                name: z.string().optional(),
                label: localizedText.optional(),
                description: localizedText.optional(),
                tags: z.array(z.string()).optional(),
                scenarios: z
                    .array(z.object({ id: z.string(), label: z.string(), args: z.string() }).strict())
                    .optional()
            })
            .strict()
            .optional()
    })
    .strict()
