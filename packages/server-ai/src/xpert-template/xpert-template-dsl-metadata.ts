import { resolveI18nText, TAvatar } from '@xpert-ai/contracts'
import { yaml } from '@xpert-ai/server-common'

export type XpertTemplateDslMetadata = {
    description?: string
    avatar?: TAvatar
}

export function readXpertTemplateDslMetadata(dslContent: string, language: string): XpertTemplateDslMetadata {
    let document: unknown
    try {
        document = yaml.parse(dslContent)
    } catch {
        return {}
    }

    const team = readObjectField(document, 'team')
    if (!team) {
        return {}
    }

    const description = resolveI18nText(Reflect.get(team, 'description'), language) ?? undefined
    const avatar = readAvatar(Reflect.get(team, 'avatar'))

    return {
        ...(description ? { description } : {}),
        ...(avatar ? { avatar } : {})
    }
}

function readAvatar(value: unknown): TAvatar | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }

    const url = readOptionalString(Reflect.get(value, 'url'))
    const background = readOptionalString(Reflect.get(value, 'background'))
    const useNotoColorValue = Reflect.get(value, 'useNotoColor')
    const useNotoColor = typeof useNotoColorValue === 'boolean' ? useNotoColorValue : undefined
    const emoji = readEmoji(Reflect.get(value, 'emoji'))

    if (!url && !background && typeof useNotoColor === 'undefined' && !emoji) {
        return undefined
    }

    return {
        ...(url ? { url } : {}),
        ...(background ? { background } : {}),
        ...(typeof useNotoColor === 'boolean' ? { useNotoColor } : {}),
        ...(emoji ? { emoji } : {})
    }
}

function readEmoji(value: unknown): TAvatar['emoji'] | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }

    const id = readOptionalString(Reflect.get(value, 'id'))
    if (!id) {
        return undefined
    }

    const set = readEmojiSet(Reflect.get(value, 'set'))
    const colons = readOptionalString(Reflect.get(value, 'colons'))
    const unified = readOptionalString(Reflect.get(value, 'unified'))

    return {
        id,
        ...(typeof set !== 'undefined' ? { set } : {}),
        ...(colons ? { colons } : {}),
        ...(unified ? { unified } : {})
    }
}

function readEmojiSet(value: unknown): NonNullable<TAvatar['emoji']>['set'] | undefined {
    return value === '' || value === 'apple' || value === 'google' || value === 'twitter' || value === 'facebook'
        ? value
        : undefined
}

function readObjectField(value: unknown, key: string): object | undefined {
    if (!isObjectValue(value)) {
        return undefined
    }
    const field = Reflect.get(value, key)
    return isObjectValue(field) ? field : undefined
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
