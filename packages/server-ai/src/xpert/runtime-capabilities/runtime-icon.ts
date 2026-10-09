import type { IconDefinition, SkillSlashCommand } from '@xpert-ai/contracts'

type RuntimeIcon = IconDefinition | SkillSlashCommand['icon'] | null | undefined

export function normalizeRuntimeIcon(icon: IconDefinition | null | undefined): IconDefinition | undefined
export function normalizeRuntimeIcon(
    icon: SkillSlashCommand['icon'] | null | undefined
): SkillSlashCommand['icon'] | undefined
export function normalizeRuntimeIcon(icon: RuntimeIcon): IconDefinition | SkillSlashCommand['icon'] | undefined {
    if (typeof icon === 'string') {
        return icon.trim() || undefined
    }
    if (!isIconDefinitionLike(icon)) {
        return undefined
    }

    const type = icon.type.trim() as IconDefinition['type']
    const value = icon.value.trim()
    if (!isRuntimeIconSourceSupported(type, value)) {
        return undefined
    }

    return {
        ...icon,
        type,
        value
    }
}

function isIconDefinitionLike(value: unknown): value is IconDefinition {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false
    }

    return (
        typeof Reflect.get(value, 'type') === 'string' &&
        Boolean(Reflect.get(value, 'type').trim()) &&
        typeof Reflect.get(value, 'value') === 'string' &&
        Boolean(Reflect.get(value, 'value').trim())
    )
}

function isRuntimeIconSourceSupported(type: IconDefinition['type'], value: string) {
    if (type === 'emoji' || type === 'font') {
        return true
    }
    if (type === 'svg') {
        return isInlineSvg(value) || isBrowserAddressableUrl(value)
    }
    if (type === 'image' || type === 'lottie') {
        return isBrowserAddressableUrl(value)
    }
    return false
}

function isInlineSvg(value: string) {
    const markup = value.trim().replace(/^<\?xml[\s\S]*?\?>\s*/i, '')
    return /^<svg[\s>]/i.test(markup)
}

function isBrowserAddressableUrl(value: string) {
    return /^(https?:|data:|blob:)/i.test(value) || value.startsWith('/')
}
