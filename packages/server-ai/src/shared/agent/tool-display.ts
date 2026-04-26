import { I18nObject } from '@xpert-ai/contracts'

export type ToolDisplayMetadata = {
    displayTitle?: I18nObject
    displayMessage?: I18nObject
}

export type ToolActivityDisplay = {
    title: I18nObject | string
    message?: I18nObject | string
}

export function readToolDisplayMetadata(metadata: unknown): ToolDisplayMetadata {
    return {
        displayTitle: readI18nMetadataValue(readMetadataProperty(metadata, 'displayTitle')),
        displayMessage: readI18nMetadataValue(readMetadataProperty(metadata, 'displayMessage'))
    }
}

export function resolveToolActivityDisplay(metadata: unknown, toolName: string): ToolActivityDisplay {
    const displayTitle =
        readI18nMetadataValue(readMetadataProperty(metadata, 'displayTitle')) ??
        readI18nMetadataValue(readMetadataProperty(metadata, 'toolDisplayTitle'))
    const displayMessage =
        readI18nMetadataValue(readMetadataProperty(metadata, 'displayMessage')) ??
        readI18nMetadataValue(readMetadataProperty(metadata, 'toolDisplayMessage'))
    const configuredToolName = readMetadataProperty(metadata, 'toolName')

    return {
        title:
            displayTitle ??
            readI18nMetadataValue(configuredToolName) ??
            readStringMetadataValue(configuredToolName) ??
            readStringMetadataValue(readMetadataProperty(metadata, toolName)) ??
            toolName,
        message: displayMessage
    }
}

export function readI18nMetadataValue(value: unknown): I18nObject | undefined {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    const enUS = readMetadataProperty(value, 'en_US')
    if (typeof enUS !== 'string' || !enUS.trim()) {
        return undefined
    }

    const zhHans = readMetadataProperty(value, 'zh_Hans')
    return {
        en_US: enUS.trim(),
        ...(typeof zhHans === 'string' && zhHans.trim() ? { zh_Hans: zhHans.trim() } : {})
    }
}

export function readStringMetadataValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function readMetadataProperty(value: unknown, property: string): unknown {
    if (!value || typeof value !== 'object') {
        return undefined
    }

    return Reflect.get(value, property)
}
