import type { I18nObject, IconDefinition, XpertProjectTypeDefinition } from '@xpert-ai/contracts'

export interface ProjectApplicationDefinition {
    name: string
    displayName?: string | I18nObject
    projectTypes: XpertProjectTypeDefinition[]
}

function isText(value: unknown): value is string | I18nObject {
    return (
        typeof value === 'string' ||
        (!!value &&
            typeof value === 'object' &&
            !Array.isArray(value) &&
            Object.values(value).every((item) => item === undefined || typeof item === 'string'))
    )
}

function projectTypeIcon(value: unknown): IconDefinition | undefined {
    if (value === undefined) return undefined
    if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        !('value' in value) ||
        !['image', 'svg', 'font', 'emoji', 'lottie'].includes(String(value.type)) ||
        typeof value.value !== 'string' ||
        ('color' in value && typeof value.color !== 'string') ||
        ('size' in value && typeof value.size !== 'number') ||
        ('alt' in value && typeof value.alt !== 'string') ||
        ('style' in value &&
            (!value.style ||
                typeof value.style !== 'object' ||
                Array.isArray(value.style) ||
                !Object.values(value.style).every((item) => typeof item === 'string')))
    ) {
        throw new Error('Invalid Project type icon')
    }
    return value as IconDefinition
}

/** Parse only the current platform's trusted loaded App metadata, once at the boundary. */
export function projectApplicationDefinitions(value: unknown): ProjectApplicationDefinition[] {
    if (!value || typeof value !== 'object' || !('xpert' in value)) return []
    const target = value.xpert
    if (!target || typeof target !== 'object' || !('marketplace' in target)) return []
    const marketplace = target.marketplace
    if (
        !marketplace ||
        typeof marketplace !== 'object' ||
        !('contents' in marketplace) ||
        !Array.isArray(marketplace.contents)
    )
        return []
    const result: ProjectApplicationDefinition[] = []
    for (const item of marketplace.contents) {
        const app: unknown = item
        if (!app || typeof app !== 'object' || !('type' in app) || app.type !== 'app' || !('projectTypes' in app))
            continue
        if (!('name' in app) || typeof app.name !== 'string' || !app.name.trim() || !Array.isArray(app.projectTypes)) {
            throw new Error('Invalid Project application definition')
        }
        const types: XpertProjectTypeDefinition[] = []
        for (const item of app.projectTypes) {
            const type: unknown = item
            if (
                !type ||
                typeof type !== 'object' ||
                !('key' in type) ||
                typeof type.key !== 'string' ||
                !/^[a-z][a-z0-9_-]{0,99}$/.test(type.key) ||
                !('title' in type) ||
                !isText(type.title) ||
                !('binding' in type) ||
                !type.binding ||
                typeof type.binding !== 'object' ||
                !('kind' in type.binding)
            ) {
                throw new Error('Invalid Project type definition')
            }
            const icon = projectTypeIcon('icon' in type ? type.icon : undefined)
            if (type.binding.kind === 'project')
                types.push({ key: type.key, title: type.title, icon, binding: { kind: 'project' } })
            else if (
                type.binding.kind === 'entity' &&
                'providerKey' in type.binding &&
                typeof type.binding.providerKey === 'string' &&
                type.binding.providerKey.trim()
            ) {
                types.push({
                    key: type.key,
                    title: type.title,
                    icon,
                    binding: { kind: 'entity', providerKey: type.binding.providerKey }
                })
            } else throw new Error('Invalid Project type binding')
        }
        result.push({
            name: app.name,
            displayName: 'displayName' in app && isText(app.displayName) ? app.displayName : app.name,
            projectTypes: types
        })
    }
    return result
}
