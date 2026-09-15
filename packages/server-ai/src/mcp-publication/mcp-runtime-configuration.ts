import type { McpPublicationRuntimeConfiguration } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { z } from 'zod'

const runtimeSchema = z
    .object({
        files: z
            .object({ type: z.literal('user') })
            .strict()
            .optional()
    })
    .strict()

/** Parse management input and persisted JSON before granting host capabilities. */
export function parseMcpRuntimeConfiguration(value: unknown): McpPublicationRuntimeConfiguration | null {
    if (value === null || value === undefined) return null
    const result = runtimeSchema.safeParse(value)
    if (!result.success) {
        throw new BadRequestException(
            t('server-ai:Error.McpRuntimeConfigurationInvalid', {
                defaultValue: 'The MCP runtime configuration is invalid.'
            })
        )
    }
    const { files } = result.data
    return files ? { files: { type: 'user' } } : {}
}
