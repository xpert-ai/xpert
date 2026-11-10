import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Input, Label, Checkbox, Textarea } from '@xpert-ai/shadcn-ui'
import { projectConfigurationValuesSchema, type ProjectConfigurationValue, type ProjectConfigurationValues } from '@xpert-ai/contracts'
import { labelSchema, localized, Choice } from './shared'
import { configurationI18n } from '../i18n'
export interface FieldSchema {
    type?: string | string[]; title?: z.infer<typeof labelSchema>; description?: z.infer<typeof labelSchema>
    properties?: { [key: string]: FieldSchema }; required?: string[]; enum?: ProjectConfigurationValue[]
    oneOf?: FieldSchema[]; anyOf?: FieldSchema[]; allOf?: FieldSchema[]; $ref?: string
    minimum?: number; maximum?: number; minLength?: number; maxLength?: number; format?: string
}
export const fieldSchema: z.ZodType<FieldSchema> = z.lazy(() => z.object({
    type: z.union([z.string(), z.array(z.string())]).optional(), title: labelSchema.optional(), description: labelSchema.optional(),
    properties: z.record(fieldSchema).optional(), required: z.array(z.string()).optional(),
    enum: z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    oneOf: z.array(fieldSchema).optional(), anyOf: z.array(fieldSchema).optional(), allOf: z.array(fieldSchema).optional(), $ref: z.string().optional(),
    minimum: z.number().optional(), maximum: z.number().optional(), minLength: z.number().optional(), maxLength: z.number().optional(), format: z.string().optional()
}).passthrough())
export function JsonField({ value, onChange, label, disabled, locale, objectOnly = false }: { objectOnly?: boolean; locale: string; value: ProjectConfigurationValue | undefined; onChange: (value: ProjectConfigurationValue) => void; label: string; disabled: boolean }) {
    const [text, setText] = useState(JSON.stringify(value ?? {}, null, 2))
    useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value])
    return <Textarea aria-label={label} value={text} disabled={disabled} className="min-h-28 font-mono" onChange={(event) => {
        setText(event.target.value)
        try { const parsed = projectConfigurationValuesSchema.parse({ value: JSON.parse(event.target.value) }).value;
            if (objectOnly) projectConfigurationValuesSchema.parse(parsed)
            event.target.setCustomValidity(''); onChange(parsed) }
        catch { event.target.setCustomValidity(configurationI18n(locale).t('invalidJson')) }
    }} />
}
export function SchemaForm({ schema, values, onChange, locale, disabled, prefix = 'configuration' }: {
    schema: FieldSchema; values: ProjectConfigurationValues; onChange: (values: ProjectConfigurationValues) => void; locale: string; disabled: boolean; prefix?: string
}) {
    const t = configurationI18n(locale)
    if (schema.oneOf || schema.anyOf || schema.allOf || schema.$ref || !Object.keys(schema.properties ?? {}).length)
        return <JsonField locale={locale} label={t.t('type')} value={values} disabled={disabled} objectOnly
            onChange={(value) => onChange(projectConfigurationValuesSchema.parse(value))} />
    return <div className="space-y-4">{Object.entries(schema.properties ?? {}).map(([key, field]) => {
        const label = localized(field.title, locale) || key, id = `${prefix}-${key}`, value = values[key]
        const update = (next: ProjectConfigurationValue | undefined) => {
            const result = { ...values }; if (next === undefined) delete result[key]; else result[key] = next; onChange(result)
        }
        const required = schema.required?.includes(key)
        return <div key={key} className="space-y-2"><Label htmlFor={id}>{label}{required ? ' *' : ''}</Label>
            {field.oneOf || field.anyOf || field.allOf || field.$ref ? <JsonField locale={locale} label={label} value={value} onChange={update} disabled={disabled} />
            : field.type === 'object' && field.properties ? <SchemaForm schema={field} values={value && typeof value === 'object' && !Array.isArray(value) ? value : {}}
                onChange={update} locale={locale} disabled={disabled} prefix={id} />
            : field.enum ? <Choice label={label} value={value === undefined ? '' : String(field.enum.findIndex((item) => item === value))}
                options={field.enum.map((item, index) => ({ value: String(index), label: String(item) }))}
                onChange={(index) => update(field.enum?.[Number(index)])} disabled={disabled} />
            : field.type === 'boolean' ? <div className="flex items-center gap-2"><Checkbox id={id} checked={value === true} disabled={disabled} onCheckedChange={(checked) => update(checked === true)} /><span className="text-sm">{t.t(value ? 'enabled' : 'disabled')}</span></div>
            : field.type === 'number' || field.type === 'integer' ? <Input id={id} type="number" min={field.minimum} max={field.maximum} step={field.type === 'integer' ? 1 : 'any'} required={required}
                value={typeof value === 'number' ? value : ''} disabled={disabled} onChange={(event) => update(Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined)} />
            : field.type === 'string' ? <Input id={id} type={field.format === 'date' ? 'date' : field.format === 'email' ? 'email' : 'text'} value={typeof value === 'string' ? value : ''}
                minLength={field.minLength} maxLength={field.maxLength} required={required} disabled={disabled} onChange={(event) => update(event.target.value)} />
            : <JsonField locale={locale} label={label} value={value} onChange={update} disabled={disabled} />}
            {field.description && <p className="text-xs text-muted-foreground">{localized(field.description, locale)}</p>}
        </div>
    })}</div>
}
