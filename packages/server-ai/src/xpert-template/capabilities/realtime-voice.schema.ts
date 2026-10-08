import { z } from 'zod'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

export const realtimeVoiceSelectionSchema = z
    .object({
        modelId: z.string().min(1).max(1000),
        voice: z
            .string()
            .min(1)
            .max(160)
            .regex(/^[a-zA-Z0-9_-]+$/)
    })
    .strict()

export function parseRealtimeVoiceSelection(value: unknown) {
    if (value === undefined) return undefined
    const result = realtimeVoiceSelectionSchema.safeParse(value)
    if (!result.success) throw new BadRequestException(t('server-ai:Error.RealtimeConfigurationInvalid'))
    return { modelId: result.data.modelId, voice: result.data.voice }
}
