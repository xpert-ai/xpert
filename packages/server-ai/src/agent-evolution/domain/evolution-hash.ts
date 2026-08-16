import { createHash } from 'crypto'

export type EvolutionJson = null | boolean | number | string | EvolutionJson[] | { [key: string]: EvolutionJson }

export function hashEvolutionValue(value: EvolutionJson) {
    return `sha256:${createHash('sha256').update(canonicalEvolutionJson(value)).digest('hex')}`
}

export function canonicalEvolutionJson(value: EvolutionJson): string {
    if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
        return JSON.stringify(value)
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => canonicalEvolutionJson(item)).join(',')}]`
    }
    return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonicalEvolutionJson(value[key])}`)
        .join(',')}}`
}
