import type { JSONValue } from '@xpert-ai/contracts'
import { IsDateString, IsObject } from 'class-validator'

export class UpdateMcpSourceConfigurationInput {
    @IsObject()
    values: Record<string, JSONValue>

    @IsDateString()
    revision: string
}
