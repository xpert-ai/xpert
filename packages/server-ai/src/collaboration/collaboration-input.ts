import { BadRequestException } from '@nestjs/common'

export function requiredText(value: unknown, label: string, max: number) {
    const text = optionalText(value, max)
    if (!text) throw new BadRequestException(`${label} is required.`)
    return text
}
export function optionalText(value: unknown, max: number) {
    return typeof value === 'string' && value.trim() && value.trim().length <= max ? value.trim() : undefined
}
export function optionalBase64(value: unknown, max: number) {
    const text = optionalText(value, max)
    return text && /^[A-Za-z0-9+/=_-]+$/.test(text) ? text : null
}
export function positiveInteger(value: unknown, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback
}
export function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}
