import type { IconDefinition } from '@xpert-ai/contracts'

function iconText(value: unknown) {
    return typeof value === 'string' && value.trim() ? value : undefined
}

function isIconType(value: unknown): value is IconDefinition['type'] {
    return value === 'image' || value === 'svg' || value === 'font' || value === 'emoji' || value === 'lottie'
}

export function parseToolIcon(candidate: unknown): IconDefinition | undefined {
    if (!candidate || typeof candidate !== 'object' || !('type' in candidate) || !isIconType(candidate.type))
        return undefined

    const value = 'value' in candidate ? iconText(candidate.value) : undefined
    if (!value) return undefined
    const color = 'color' in candidate ? iconText(candidate.color) : undefined
    const alt = 'alt' in candidate ? iconText(candidate.alt) : undefined
    const size =
        'size' in candidate &&
        typeof candidate['size'] === 'number' &&
        Number.isFinite(candidate['size']) &&
        candidate['size'] > 0 &&
        candidate['size'] <= 64
            ? candidate['size']
            : undefined

    return {
        type: candidate['type'],
        value,
        ...(color ? { color } : {}),
        ...(alt ? { alt } : {}),
        ...(size ? { size } : {})
    }
}
