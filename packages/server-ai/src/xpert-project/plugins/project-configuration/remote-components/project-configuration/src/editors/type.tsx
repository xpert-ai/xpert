import { useState, useEffect } from 'react'
import { z } from 'zod'
import { Button } from '@xpert-ai/shadcn-ui'
import { projectConfigurationValuesSchema, type ProjectConfigurationValues } from '@xpert-ai/contracts'
import { action, mutate, useEditor, Status, type EditorProps } from './shared'
import { fieldSchema, SchemaForm } from './schema-form'
import { configurationI18n } from '../i18n'
const typeSchema = z.object({ revision: z.number(), schema: fieldSchema.optional(), effectiveValues: projectConfigurationValuesSchema, canEdit: z.boolean() })
export function TypeEditor({ locale }: EditorProps) {
    const t = configurationI18n(locale), state = useEditor(() => action('type', {}, typeSchema), [])
    const [values, setValues] = useState<ProjectConfigurationValues>({}), [saved, setSaved] = useState(false)
    useEffect(() => { if (state.data) setValues(structuredClone(state.data.effectiveValues)) }, [state.data])
    return <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (state.data?.canEdit) void state.run(async () => {
        await mutate('type-save', { revision: state.data!.revision, values }); setSaved(true)
    }) }}>
        <Status {...state} locale={locale} />
        {state.data?.schema && <SchemaForm schema={state.data.schema} values={values} onChange={(value) => { setValues(value); setSaved(false) }} locale={locale} disabled={!state.data.canEdit || state.busy} />}
        {state.data?.canEdit && state.data.schema && <Button type="submit" disabled={state.busy}>{t.t('saveSettings')}</Button>}
        {saved && <p role="status" className="text-sm text-muted-foreground">{t.t('saved')}</p>}
    </form>
}
