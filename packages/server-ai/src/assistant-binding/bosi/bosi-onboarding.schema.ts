import { z } from 'zod/v3'
import type { BosiOnboardingPreferences } from '@xpert-ai/contracts'

const identity = z.string().trim().min(1).max(200)
export const bosiOnboardingChoiceSchema = z
    .object({
        revision: z.number().int().nonnegative(),
        kind: z.enum(['plugin', 'connector']),
        id: identity,
        selected: z.boolean()
    })
    .strict()

export function parseBosiOnboardingPreferences(value: unknown): BosiOnboardingPreferences {
    return bosiOnboardingPreferencesSchema.parse(value) as BosiOnboardingPreferences
}
export const bosiOnboardingConnectionSchema = z.object({ provider: identity }).strict()
export const bosiOnboardingConnectionScopeSchema = z
    .object({ workspaceId: z.string().uuid(), bindingId: z.string().uuid() })
    .strict()
export type BosiOnboardingChoiceInput = Required<z.output<typeof bosiOnboardingChoiceSchema>>
export type BosiOnboardingConnectionInput = Required<z.output<typeof bosiOnboardingConnectionSchema>>
export type BosiOnboardingConnectionScope = Required<z.output<typeof bosiOnboardingConnectionScopeSchema>>
export const bosiOnboardingPreferencesSchema = z
    .object({
        version: z.literal(1),
        revision: z.number().int().nonnegative(),
        workspaceId: z.string().uuid(),
        packages: z
            .array(
                z
                    .object({
                        packageId: z.string().uuid(),
                        resource: z
                            .object({ bindingId: z.string().uuid(), version: z.string().regex(/^[a-f0-9]{64}$/) })
                            .strict()
                    })
                    .strict()
            )
            .max(50),
        connectorIds: z.array(z.string().uuid()).max(50)
    })
    .strict()
