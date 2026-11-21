import type { JSONSchema4 } from 'json-schema'
import { z } from 'zod/v3'
import { assertWidgetBudget } from './validation'
import { normalizeA2UIServerMessages, type WidgetResult } from './protocol'
import type { WidgetsMiddlewareConfig } from './options'

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)])
)
const valuesSchema = z.record(jsonValue)

export function parseWidgetJson(input: string): unknown {
    return JSON.parse(input)
}

function schemaFromExample(example: JsonValue): JSONSchema4 {
    if (Array.isArray(example)) return { type: 'array', items: example.length ? schemaFromExample(example[0]) : {} }
    if (example && typeof example === 'object')
        return {
            type: 'object',
            properties: Object.fromEntries(
                Object.entries(example).map(([key, value]) => [key, schemaFromExample(value)])
            ),
            required: Object.keys(example)
        }
    if (typeof example === 'string') return { type: 'string' }
    if (typeof example === 'number') return { type: 'number' }
    if (typeof example === 'boolean') return { type: 'boolean' }
    return {}
}

export function buildWidgetDefinitions(items: WidgetsMiddlewareConfig['widgets'] = []) {
    return items.map((item, index) => {
        const raw = parseWidgetJson(item.widget)
        assertWidgetBudget({ components: raw })
        const template = z.array(valuesSchema).min(1).parse(raw)
        const rawValues = item.value ? parseWidgetJson(item.value) : {}
        assertWidgetBudget(rawValues)
        const values = valuesSchema.parse(rawValues)
        return {
            name: item.name || `widget_${index + 1}`,
            description: item.description,
            template,
            values,
            schema: schemaFromExample(values)
        }
    })
}

export function parseWidgetValues(raw: unknown) {
    const input = typeof raw === 'string' ? parseWidgetJson(raw) : raw
    assertWidgetBudget(input)
    const parsed = valuesSchema.parse(input)
    return parsed.values && typeof parsed.values === 'object' && !Array.isArray(parsed.values) ? parsed.values : parsed
}

type WidgetDefinition = ReturnType<typeof buildWidgetDefinitions>[number]

export function buildManualWidgetResult(widget: WidgetDefinition, input: unknown): WidgetResult {
    const values = parseWidgetValues(input)
    return { name: widget.name, messages: fillManualWidgetMessages(widget, values), values }
}

export function buildManualWidgetResults(widgets: WidgetDefinition[], raw: unknown): WidgetResult[] {
    assertWidgetBudget(raw)
    if (Array.isArray(raw)) {
        const values = z.array(valuesSchema).parse(raw)
        return widgets.map((widget, index) => buildManualWidgetResult(widget, values[index] ?? widget.values))
    }
    const values = valuesSchema.parse(raw)
    if (widgets.length === 1) return [buildManualWidgetResult(widgets[0], values)]
    const zeroBased = Object.hasOwn(values, '0')
    return widgets.map((widget, index) =>
        buildManualWidgetResult(
            widget,
            values[widget.name] ?? values[String(index + (zeroBased ? 0 : 1))] ?? widget.values
        )
    )
}

export function manualWidgetPrompt(widgets: WidgetDefinition[], toolCalling: boolean): string {
    if (!widgets.length) return ''
    const names = widgets.map((widget) => widget.name).join(', ')
    const guidance = `Configured templates: ${names}. Use one only if it matches the request.`
    if (toolCalling) return guidance
    return [
        guidance,
        'For a configured template, return its value object; for multiple templates return an array in template order or an object keyed by template name. Otherwise use a generated messages array.',
        ...widgets.map(
            (widget) =>
                `Template ${widget.name}${widget.description ? ` (${widget.description})` : ''}:\n${JSON.stringify(widget.template)}\nValue template:\n${JSON.stringify(widget.values)}`
        )
    ].join('\n\n')
}

export function buildManualWidgetMessages(widget: WidgetDefinition, input: unknown) {
    return fillManualWidgetMessages(widget, parseWidgetValues(input))
}

function fillManualWidgetMessages(widget: WidgetDefinition, values: z.output<typeof valuesSchema>) {
    const resolve = (pointer: string): JsonValue | undefined => {
        if (!pointer || pointer === '/') return values
        let current: JsonValue = values
        for (const segment of pointer
            .slice(1)
            .split('/')
            .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'))) {
            if (['__proto__', 'prototype', 'constructor'].includes(segment)) return undefined
            if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined
            current = Reflect.get(current, segment)
        }
        return current
    }
    const fill = (value: JsonValue): JsonValue => {
        if (Array.isArray(value)) return value.map(fill)
        if (!value || typeof value !== 'object') return value
        const next = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fill(item)]))
        if (typeof next.path === 'string' && (!next.path || next.path.startsWith('/'))) {
            const resolved = resolve(next.path)
            if (resolved !== undefined) {
                delete next.path
                next.literalString =
                    resolved === null ? '' : typeof resolved === 'string' ? resolved : JSON.stringify(resolved)
            }
        }
        return next
    }
    const components = widget.template.map(fill)
    const root = widget.template.find((item) => item.id === 'root')?.id ?? widget.template[0].id
    return normalizeA2UIServerMessages(
        [{ surfaceUpdate: { surfaceId: '@default', components } }, { beginRendering: { surfaceId: '@default', root } }],
        { strictCatalog: false }
    )
}
