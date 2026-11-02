import { t } from 'i18next'
import { join } from 'node:path'
import { z } from 'zod'
import {
    atomicTemplateWrite,
    hashContent,
    planSync,
    readOptionalFile,
    saveSyncManifest,
    SyncManifest,
    SyncResult
} from './template-sync-state'

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(jsonValue), z.record(jsonValue)])
)
const descriptor = z.object({ id: z.string().min(1) }).catchall(jsonValue)
const group = z
    .object({
        recommendedApps: z
            .array(descriptor)
            .refine((entries) => new Set(entries.map(({ id }) => id)).size === entries.length)
    })
    .catchall(jsonValue)
const catalogSchema = z
    .object({
        templates: z.record(group),
        details: z.record(jsonValue).optional()
    })
    .catchall(jsonValue)
type Catalog = z.infer<typeof catalogSchema>

function parseCatalog(value: unknown, filePath: string): Catalog {
    const parsed = catalogSchema.safeParse(value)
    if (!parsed.success) throw new Error(t('server-ai:Error.InvalidTemplateCatalogUpgrade', { filePath }))
    return parsed.data
}

function stableJson(value: JsonValue): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
    if (value && typeof value === 'object') {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
            .join(',')}}`
    }
    return JSON.stringify(value)
}

export async function syncTemplateCatalog(
    root: string,
    builtinValue: unknown,
    manifest: SyncManifest,
    result: SyncResult,
    legacy: boolean
) {
    const file = join(root, 'templates.json')
    const builtin = parseCatalog(builtinValue, file)
    const content = await readOptionalFile(file)
    let external: Catalog
    try {
        external = content ? parseCatalog(JSON.parse(content.toString('utf8')), file) : { templates: {} }
    } catch {
        throw new Error(t('server-ai:Error.InvalidTemplateCatalogUpgrade', { filePath: file }))
    }
    let changed = !content
    const pending: string[] = []
    const sync = (parts: string[], value: JsonValue, current: JsonValue | undefined, apply: () => void) => {
        const key = JSON.stringify(parts)
        const currentHash = current === undefined ? undefined : hashContent(stableJson(current))
        const builtinHash = hashContent(stableJson(value))
        if (
            planSync(
                manifest.catalog,
                key,
                currentHash,
                builtinHash,
                result,
                `templates.json:${key}`,
                !!content && (legacy || Object.prototype.hasOwnProperty.call(manifest.catalog, key))
            )
        ) {
            apply()
            changed = true
            pending.push(key)
        }
    }
    for (const [key, value] of Object.entries(builtin)) {
        if (key === 'templates' || key === 'details') continue
        sync([key], value, external[key], () => {
            external[key] = value
        })
    }
    for (const [locale, builtinGroup] of Object.entries(builtin.templates)) {
        const ensureGroup = () => (external.templates[locale] ??= { recommendedApps: [] })
        for (const [key, value] of Object.entries(builtinGroup)) {
            if (key === 'recommendedApps') continue
            sync(['templates', locale, key], value, external.templates[locale]?.[key], () => {
                ensureGroup()[key] = value
            })
        }
        for (const entry of builtinGroup.recommendedApps) {
            const current = external.templates[locale]?.recommendedApps.find(({ id }) => id === entry.id)
            sync(['templates', locale, 'recommendedApps', entry.id], entry, current, () => {
                const entries = ensureGroup().recommendedApps
                const index = entries.findIndex(({ id }) => id === entry.id)
                if (index === -1) entries.push(entry)
                else entries[index] = entry
            })
        }
        if (!content) ensureGroup()
    }
    for (const [id, value] of Object.entries(builtin.details ?? {})) {
        sync(['details', id], value, external.details?.[id], () => {
            ;(external.details ??= {})[id] = value
        })
    }
    if (!content && builtin.details && !external.details) external.details = {}
    await saveSyncManifest(root, manifest)
    if (changed)
        await atomicTemplateWrite(
            root,
            file,
            JSON.stringify(external, null, 4) + '\n',
            content ? hashContent(content) : null
        )
    for (const key of pending) {
        manifest.catalog[key].hash = manifest.catalog[key].pending
        delete manifest.catalog[key].pending
    }
    await saveSyncManifest(root, manifest)
}
