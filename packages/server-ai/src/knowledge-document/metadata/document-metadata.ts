import { KBMetadataFieldDef } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'

export function normalizeFileExtension(value: unknown) {
    return typeof value === 'string' ? value.trim().replace(/^\.+/, '').toLocaleLowerCase() : value
}

export function normalizeMimeType(value: unknown) {
    return typeof value === 'string' ? value.trim().toLocaleLowerCase() : value
}

export function validateMetadataAgainstSchema(
    metadata: Record<string, unknown>,
    schema: KBMetadataFieldDef[] | undefined,
    scope: 'document' | 'chunk'
) {
    for (const field of schema ?? []) {
        if ((field.scope ?? 'document') !== scope || !(field.key in metadata)) continue
        const value = metadata[field.key]
        if (value == null) continue
        const valid =
            ((field.type === 'string' || field.type === 'enum' || field.type === 'datetime') &&
                typeof value === 'string') ||
            (field.type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
            (field.type === 'boolean' && typeof value === 'boolean') ||
            (field.type === 'string[]' && Array.isArray(value) && value.every((item) => typeof item === 'string')) ||
            (field.type === 'number[]' &&
                Array.isArray(value) &&
                value.every((item) => typeof item === 'number' && Number.isFinite(item))) ||
            (field.type === 'object' && typeof value === 'object' && !Array.isArray(value))
        if (
            !valid ||
            (field.type === 'datetime' && (Number.isNaN(Date.parse(String(value))) || !String(value).endsWith('Z')))
        ) {
            throw new BadRequestException(`Metadata '${field.key}' must be of type '${field.type}'.`)
        }
        if (field.type === 'enum' && field.enumValues?.length && !field.enumValues.includes(String(value))) {
            throw new BadRequestException(`Metadata '${field.key}' must be one of: ${field.enumValues.join(', ')}.`)
        }
    }
}
