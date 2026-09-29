// Catalog upgrades add only explicitly introduced IDs once. Never overwrite user
// descriptors or restore entries that were deliberately removed after an upgrade.
import { t } from 'i18next'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

type TemplateRef = { id: string }
type TemplateGroup = { recommendedApps: TemplateRef[]; categories?: string[] }
type UpgradeCatalog = { templates: Record<string, TemplateGroup>; details?: object }

function isObject(value: unknown): value is object {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isTemplateRef(value: unknown): value is TemplateRef {
    return isObject(value) && 'id' in value && typeof value.id === 'string'
}

function isTemplateGroup(value: unknown): value is TemplateGroup {
    return (
        isObject(value) &&
        'recommendedApps' in value &&
        Array.isArray(value.recommendedApps) &&
        value.recommendedApps.every(isTemplateRef) &&
        (!('categories' in value) ||
            (Array.isArray(value.categories) && value.categories.every((item) => typeof item === 'string')))
    )
}

function isCatalog(value: unknown): value is UpgradeCatalog {
    return (
        isObject(value) &&
        'templates' in value &&
        isObject(value.templates) &&
        Object.values(value.templates).every(isTemplateGroup) &&
        (!('details' in value) || isObject(value.details))
    )
}

async function readCatalog(filePath: string): Promise<UpgradeCatalog> {
    const content = await fs.readFile(filePath, 'utf8')
    let value: unknown
    try {
        value = JSON.parse(content)
    } catch {
        throw new Error(t('server-ai:Error.InvalidTemplateCatalogUpgrade', { filePath }))
    }
    if (!isCatalog(value)) {
        throw new Error(t('server-ai:Error.InvalidTemplateCatalogUpgrade', { filePath }))
    }
    return value
}

async function exists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath)
        return true
    } catch (error) {
        if (isObject(error) && 'code' in error && error.code === 'ENOENT') return false
        throw error
    }
}

export async function upgradeBuiltinTemplateCatalog(builtinRoot: string, externalRoot: string): Promise<void> {
    await upgradeTemplateCatalog(builtinRoot, externalRoot, 'bosi-desktop-v1', ['xpert-bosi-desktop'])
    const extensionPath = join(builtinRoot, 'catalog-extensions.json')
    if (!(await exists(extensionPath))) return
    const extensions: unknown = JSON.parse(await fs.readFile(extensionPath, 'utf8'))
    if (!Array.isArray(extensions) || !extensions.every(isCatalogExtension)) {
        throw new Error(t('server-ai:Error.InvalidTemplateCatalogUpgrade', { filePath: extensionPath }))
    }
    for (const extension of extensions) {
        await upgradeTemplateCatalog(builtinRoot, externalRoot, extension.migration, extension.ids, extension.source)
    }
}

type CatalogExtension = { migration: string; ids: string[]; source: string }
function isCatalogExtension(value: unknown): value is CatalogExtension {
    return (
        isObject(value) &&
        'migration' in value &&
        typeof value.migration === 'string' &&
        /^[a-z0-9-]+$/.test(value.migration) &&
        'source' in value &&
        typeof value.source === 'string' &&
        /^[a-z0-9-]+\.json$/.test(value.source) &&
        'ids' in value &&
        Array.isArray(value.ids) &&
        value.ids.every((id) => typeof id === 'string' && !!id)
    )
}

export async function upgradeTemplateCatalog(
    builtinRoot: string,
    externalRoot: string,
    migration: string,
    ids: string[],
    source = 'templates.json'
): Promise<void> {
    const marker = join(externalRoot, `.catalog-upgrade-${migration}`)
    if (await exists(marker)) return

    const introducedIds = new Set(ids)
    const builtin = await readCatalog(join(builtinRoot, source))
    const additions = Object.entries(builtin.templates)
        .map(([locale, group]) => ({
            locale,
            entries: group.recommendedApps.filter(({ id }) => introducedIds.has(id))
        }))
        .filter(({ entries }) => entries.length > 0)
    if (!additions.length) return

    const catalogPath = join(externalRoot, 'templates.json')
    const catalog = await readCatalog(catalogPath)
    let changed = false
    for (const { locale, entries } of additions) {
        const group = catalog.templates[locale] ?? { recommendedApps: [] }
        for (const entry of entries) {
            if (group.recommendedApps.some(({ id }) => id === entry.id)) continue
            group.recommendedApps.push(entry)
            changed = true
            // Keep existing detail overrides, even if their list entry was absent.
            if (
                builtin.details &&
                Object.prototype.hasOwnProperty.call(builtin.details, entry.id) &&
                !Object.prototype.hasOwnProperty.call(catalog.details ?? {}, entry.id)
            ) {
                catalog.details = { ...catalog.details, [entry.id]: Reflect.get(builtin.details, entry.id) }
            }
        }
        catalog.templates[locale] = group
    }
    if (changed) {
        const temporaryPath = `${catalogPath}.${randomUUID()}.tmp`
        try {
            await fs.writeFile(temporaryPath, JSON.stringify(catalog, null, 4) + '\n', { flag: 'wx' })
            await fs.rename(temporaryPath, catalogPath)
        } finally {
            await fs.rm(temporaryPath, { force: true })
        }
    }
    // A crash before this write is safe: the next run deduplicates by ID.
    await fs.writeFile(marker, `${migration}\n`)
}
