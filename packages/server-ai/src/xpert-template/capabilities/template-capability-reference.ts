// Store selected capabilities in the template identity so refreshes compose the
// same variant instead of replacing it with the unconfigured base template.
import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

const PREFIX = 'capabilities~'
export type CapabilityTemplateReference = { templateId: string; capabilities: string[] }

export function parseTemplateCapabilities(value: unknown): string[] {
    if (value === undefined) return []
    if (
        !Array.isArray(value) ||
        value.length > 32 ||
        value.some((key) => typeof key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(key))
    )
        invalid()
    return [...new Set(value as string[])].sort()
}

export function capabilityTemplateId(templateId: string, selected: string[]): string {
    const base = parseCapabilityTemplateId(templateId)
    const capabilities = parseTemplateCapabilities([...(base?.capabilities ?? []), ...selected])
    return capabilities.length
        ? PREFIX +
              Buffer.from(JSON.stringify({ templateId: base?.templateId ?? templateId, capabilities })).toString(
                  'base64url'
              )
        : templateId
}

export function parseCapabilityTemplateId(id: string): CapabilityTemplateReference | null {
    if (!id.startsWith(PREFIX)) return null
    try {
        if (id.length > 8192) invalid()
        const value: unknown = JSON.parse(Buffer.from(id.slice(PREFIX.length), 'base64url').toString())
        if (
            !value ||
            typeof value !== 'object' ||
            !('templateId' in value) ||
            typeof value.templateId !== 'string' ||
            !value.templateId ||
            value.templateId.startsWith(PREFIX) ||
            !('capabilities' in value)
        )
            invalid()
        const capabilities = parseTemplateCapabilities(value.capabilities)
        if (!capabilities.length) invalid()
        return { templateId: value.templateId, capabilities }
    } catch {
        return invalid()
    }
}

function invalid(): never {
    throw new BadRequestException(t('server-ai:Error.TemplateCapabilityNotSupported'))
}
