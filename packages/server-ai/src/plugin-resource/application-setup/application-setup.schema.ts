import { z } from 'zod/v3'

const identity = {
    pluginName: z.string().trim().min(1).max(255),
    appName: z.string().trim().min(1).max(255)
}

export const applicationSetupSchema = z
    .object(identity)
    .strict()
    .transform((input) => ({
        pluginName: input.pluginName,
        appName: input.appName
    }))

export const applicationBindToolsetSchema = z
    .object({
        ...identity,
        key: z.string().trim().min(1).max(255),
        toolsetId: z.string().uuid()
    })
    .strict()
    .transform((input) => ({
        pluginName: input.pluginName,
        appName: input.appName,
        key: input.key,
        toolsetId: input.toolsetId
    }))

export type ApplicationSetupInput = z.output<typeof applicationSetupSchema>
export type ApplicationBindToolsetInput = z.output<typeof applicationBindToolsetSchema>
