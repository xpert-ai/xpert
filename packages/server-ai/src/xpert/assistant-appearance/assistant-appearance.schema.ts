import { z } from 'zod/v3'

const resourceId = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/)
const resourceUrl = z
    .string()
    .max(4096)
    .refine((url) => /^(https?:\/\/|\/(?!\/))/.test(url))
const characterConfig = z
    .object({
        shape: z.enum([
            'round',
            'pebble',
            'pill',
            'drop',
            'flame',
            'triangle',
            'square',
            'bag',
            'star',
            'heart',
            'cloud',
            'clover'
        ]),
        eyes: z.enum(['oval', 'toon', 'pill', 'dot', 'ring', 'happy', 'sleepy', 'wink', 'plus', 'slash', 'squint']),
        mouth: z.enum(['none', 'smile', 'open', 'neutral', 'o']),
        motion: z.enum(['float', 'bounce', 'sway', 'none']),
        eyeSize: z.number().finite().min(0.6).max(1.5),
        eyeSpacing: z.number().finite().min(0.55).max(1.6),
        brows: z.enum(['none', 'flat', 'angry', 'worried', 'raised']).optional(),
        ink: z.enum(['auto', 'dark', 'light']).optional(),
        tilt: z.number().finite().min(-15).max(15).optional(),
        speed: z.number().finite().min(0.5).max(2).optional(),
        blink: z.boolean().optional()
    })
    .strict()
export const assistantAppearanceSchema = z.discriminatedUnion('kind', [
    z.object({ version: z.literal(1), kind: z.literal('image') }).strict(),
    z
        .object({
            version: z.literal(1),
            kind: z.literal('character'),
            id: resourceId,
            color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
            config: characterConfig.optional()
        })
        .strict(),
    z
        .object({
            version: z.literal(1),
            kind: z.literal('pet'),
            id: resourceId,
            spriteVersionNumber: z.union([z.literal(1), z.literal(2)]).optional(),
            asset: z
                .object({ type: z.enum(['sprite-atlas', 'animated-image']), url: resourceUrl })
                .strict()
                .optional()
        })
        .strict()
])
export const assistantAppearanceInputSchema = z
    .object({
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        name: z.string().trim().min(1).max(100),
        avatar: z
            .object({
                url: z
                    .string()
                    .max(4096)
                    .refine((url) => /^(https?:\/\/|\/(?!\/))/.test(url))
                    .optional(),
                background: z
                    .string()
                    .max(100)
                    .regex(/^(#[a-fA-F0-9]{3,8}|rgba?\([\d.,%\s]+\)|[a-zA-Z]+)$/)
                    .optional(),
                useNotoColor: z.boolean().optional(),
                emoji: z
                    .object({
                        id: z.string().max(100),
                        unified: z.string().max(100).optional(),
                        colons: z.string().max(150).optional(),
                        set: z.enum(['', 'apple', 'google', 'twitter', 'facebook']).optional()
                    })
                    .strict()
                    .optional(),
                appearance: assistantAppearanceSchema.optional()
            })
            .strict()
            .refine((avatar) => avatar.appearance?.kind !== 'image' || !!avatar.url)
    })
    .strict()
export type AssistantAppearanceInput = z.output<typeof assistantAppearanceInputSchema>
