import { t } from 'i18next'
import ShortUniqueId from 'short-unique-id'
import { z } from 'zod/v3'
import { assertWidgetBudget } from './validation'

const shortuuidGenerator = new ShortUniqueId({ length: 10 })
export const shortuuid = (...args: Parameters<(typeof shortuuidGenerator)['randomUUID']>) =>
    shortuuidGenerator.randomUUID(...args)

const composerSchema = z.array(z.object({ id: z.string(), component: z.record(z.record(z.unknown())) }))
type TargetNode = { id: string; type: string; properties: { [key: string]: unknown } }

// Retain the original exported Composer conversion for callers using nested renderer documents.
export function composerToComponentTreeFormat(
    items: unknown,
    dataModel: unknown,
    options?: { rootComponentId?: string; styles?: unknown; normalizeButtonAction?: boolean }
) {
    assertWidgetBudget({ components: items })
    const components = composerSchema.parse(items)
    const rootId = options?.rootComponentId ?? 'root'
    const index = new Map<string, { type: string; props: { [key: string]: unknown } }>()
    const invalid = () =>
        new Error(
            t('server-ai:Widgets.InvalidComposer', {
                defaultValue: 'Invalid Composer components or component references.'
            })
        )
    for (const item of components) {
        const entries = Object.entries(item.component)
        if (entries.length !== 1) throw invalid()
        const [type, props] = entries[0]
        index.set(item.id, { type, props })
    }
    const buildNode = (id: string, ancestors = new Set<string>()): TargetNode => {
        const definition = index.get(id)
        if (!definition || ancestors.has(id) || ancestors.size > 32) throw invalid()
        const { type, props } = definition
        const next = new Set(ancestors).add(id)
        const properties: TargetNode['properties'] = {}
        for (const [key, value] of Object.entries(props)) {
            if (key === 'child' && typeof value === 'string' && index.has(value)) {
                properties[key] = buildNode(value, next)
            } else if (
                key === 'children' &&
                value &&
                typeof value === 'object' &&
                'explicitList' in value &&
                Array.isArray(value.explicitList)
            ) {
                properties[key] = value.explicitList.map((child: unknown) => {
                    if (typeof child !== 'string') throw invalid()
                    return buildNode(child, next)
                })
            } else if (options?.normalizeButtonAction !== false && type === 'Button' && key === 'action') {
                properties[key] = typeof value === 'string' ? { name: value } : value
            } else {
                properties[key] = value
            }
        }
        return { id, type, properties }
    }
    return {
        rootComponentId: rootId,
        dataModel,
        styles: options?.styles ?? {},
        componentTree: buildNode(rootId),
        components: {}
    }
}
