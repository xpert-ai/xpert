import { useState, useEffect } from 'react'
import { z } from 'zod'
import { Button, Input, Label, Textarea, Checkbox } from '@xpert-ai/shadcn-ui'
import { projectConfigurationValuesSchema, type ProjectConfigurationValues } from '@xpert-ai/contracts'
import { action, mutate, useEditor, Status, Choice, Pager, Confirm, labelSchema, localized, type EditorProps } from './shared'
import { fieldSchema, SchemaForm } from './schema-form'
import { taskConnectorIds, withTaskConnectors } from './automation-state'
import { configurationI18n } from '../i18n'
const optionsSchema = z.object({ frequency: z.enum(['Once','Daily','Weekly','Monthly','Yearly']), time: z.string(), date: z.string().optional(), dayOfWeek: z.number().optional(), dayOfMonth: z.number().optional(), month: z.number().optional() })
const taskSchema = z.object({ id: z.string(), name: z.string().nullish(), prompt: z.string(), xpertId: z.string(), agentKey: z.string().nullish(), options: optionsSchema,
    timeZone: z.string().nullish(), status: z.string(), scheduleDescription: z.string().nullish(), runAsUserId: z.string().nullish(), pendingRunAsUserId: z.string().nullish(), runtimeState: projectConfigurationValuesSchema.nullish() })
const pageSchema = z.object({ items: z.array(taskSchema), total: z.number() })
const capabilitiesSchema = z.object({ capabilities: z.object({ agentKey: z.string().optional(), stateSchema: fieldSchema.nullish() }),
    connectors: z.object({ items: z.array(z.object({ bindingId: z.string(), label: labelSchema, granted: z.boolean().optional() })) }) })
type Task = z.infer<typeof taskSchema>
function AutomationForm({ task, overview, locale, onSaved }: EditorProps & { task?: Task; onSaved: () => void }) {
    const t = configurationI18n(locale), canManage = overview.canManage
    const [name, setName] = useState(task?.name || ''), [prompt, setPrompt] = useState(task?.prompt || '')
    const [xpertId, setXpertId] = useState(task?.xpertId || overview.experts[0]?.id || '')
    const [options, setOptions] = useState<z.infer<typeof optionsSchema>>(task?.options || { frequency: 'Daily', time: '09:00' })
    const [timeZone, setTimeZone] = useState(task?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone)
    const [runtime, setRuntime] = useState<ProjectConfigurationValues>(task?.runtimeState || {})
    const [bindings, setBindings] = useState(taskConnectorIds(task?.runtimeState || {}))
    const state = useEditor(() => xpertId ? action('automation-options', { xpertId, ...(task?.agentKey ? { agentKey: task.agentKey } : {}) }, capabilitiesSchema) : Promise.resolve(null), [xpertId])
    const [saved, setSaved] = useState(false)
    return <form className="space-y-4 rounded-lg border p-4" onSubmit={(event) => {
        event.preventDefault(); void state.run(async () => {
            const runtimeState = withTaskConnectors(runtime, bindings)
            if (canManage) await mutate('automation-save', { ...(task ? { taskId: task.id } : {}), name, prompt, xpertId,
                ...(state.data?.capabilities.agentKey ? { agentKey: state.data.capabilities.agentKey } : {}), options, timeZone, runtimeState })
            else if (task) await mutate('automation-connectors', { taskId: task.id, runtimeState })
            setSaved(true); onSaved()
        }, false)
    }}>
        <Status {...state} locale={locale} />
        {canManage && <>
            <Label htmlFor="automation-name">{t.t('name')}</Label><Input id="automation-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} disabled={state.busy} />
            <Choice label={t.t('selectExpert')} value={xpertId} onChange={(value) => { setXpertId(value); setBindings([]); setRuntime({}) }} options={overview.experts.map((expert) => ({ value: expert.id, label: expert.name }))} disabled={state.busy || !!task} />
            <Label htmlFor="automation-prompt">{t.t('prompt')}</Label><Textarea id="automation-prompt" required value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={state.busy} />
            <Choice label={t.t('frequency')} value={options.frequency} onChange={(value) => setOptions({ frequency: optionsSchema.shape.frequency.parse(value), time: options.time })}
                options={optionsSchema.shape.frequency.options.map((value) => ({ value, label: t.t(value) }))} disabled={state.busy} />
            <Label htmlFor="automation-time">{t.t('time')}</Label><Input id="automation-time" type="time" required value={options.time} onChange={(event) => setOptions({ ...options, time: event.target.value })} disabled={state.busy} />
            {options.frequency === 'Once' && <><Label htmlFor="automation-date">{t.t('date')}</Label><Input id="automation-date" type="date" required value={options.date || ''} onChange={(event) => setOptions({ ...options, date: event.target.value })} disabled={state.busy} /></>}
            {options.frequency === 'Weekly' && <Choice label={t.t('dayOfWeek')} value={options.dayOfWeek === undefined ? '' : String(options.dayOfWeek)} onChange={(value) => setOptions({ ...options, dayOfWeek: Number(value) })}
                options={Array.from({ length: 7 }, (_, day) => ({ value: String(day), label: new Intl.DateTimeFormat(t.locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + day))) }))} disabled={state.busy} />}
            {['Monthly','Yearly'].includes(options.frequency) && <><Label htmlFor="automation-day">{t.t('dayOfMonth')}</Label><Input id="automation-day" type="number" min={1} max={31} required value={options.dayOfMonth ?? ''} onChange={(event) => setOptions({ ...options, dayOfMonth: event.target.valueAsNumber })} disabled={state.busy} /></>}
            {options.frequency === 'Yearly' && <><Label htmlFor="automation-month">{t.t('month')}</Label><Input id="automation-month" type="number" min={1} max={12} required value={options.month ?? ''} onChange={(event) => setOptions({ ...options, month: event.target.valueAsNumber })} disabled={state.busy} /></>}
            <Label htmlFor="automation-timezone">{t.t('timeZone')}</Label><Input id="automation-timezone" required value={timeZone} onChange={(event) => setTimeZone(event.target.value)} disabled={state.busy} />
            {state.data?.capabilities.stateSchema && <SchemaForm schema={state.data.capabilities.stateSchema} values={runtime} onChange={setRuntime} locale={locale} disabled={state.busy} />}
        </>}
        <h4 className="font-medium">{t.t('connectors')}</h4>
        {state.data?.connectors.items.map((connector) => <label key={connector.bindingId} className="flex items-center gap-2 text-sm">
            <Checkbox checked={bindings.includes(connector.bindingId)} disabled={state.busy} onCheckedChange={(checked) => setBindings(checked === true ? [...bindings, connector.bindingId] : bindings.filter((id) => id !== connector.bindingId))} />
            {localized(connector.label, locale)}</label>)}
        <Button disabled={state.busy || !xpertId} type="submit">{t.t('saveSettings')}</Button>
        {saved && <p role="status">{t.t('saved')}</p>}
    </form>
}
export function AutomationsEditor(props: EditorProps) {
    const { overview, locale } = props, t = configurationI18n(locale), [page, setPage] = useState(1)
    const [editing, setEditing] = useState<string | null>(null), [targets, setTargets] = useState<Record<string, string>>({})
    const state = useEditor(() => action('automations', { page }, pageSchema), [page])
    return <div className="space-y-5"><Status {...state} locale={locale} />
        {state.data && !state.data.items.length && <p className="text-sm text-muted-foreground">{t.t('empty')}</p>}
        {overview.canManage && <Button disabled={state.busy || !overview.experts.length} onClick={() => setEditing(editing === 'new' ? null : 'new')}>{t.t('addAutomation')}</Button>}
        {overview.canManage && editing === 'new' && <AutomationForm {...props} onSaved={() => { setEditing(null); void state.load() }} />}
        {state.data?.items.map((task) => <div key={task.id} className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{task.name || task.prompt}</h3>
                <span className="text-xs text-muted-foreground">{t.t(task.status === 'scheduled' || task.status === 'paused' || task.status === 'archived' ? task.status : 'unknown')}</span></div>
            <p className="text-xs text-muted-foreground">{task.scheduleDescription}</p>
            <p className="text-sm">{t.t('runAs')}: {overview.members.find((member) => member.id === task.runAsUserId)?.name || task.runAsUserId}</p>
            <div className="flex flex-wrap gap-2">
                {(overview.canManage || task.runAsUserId === overview.userId) && <Button variant="outline" disabled={state.busy} onClick={() => setEditing(editing === task.id ? null : task.id)}>{t.t('edit')}</Button>}
                {overview.canManage && <><Button variant="outline" disabled={state.busy} onClick={() => void state.run(() => mutate(task.status === 'scheduled' ? 'automation-pause' : 'automation-resume', { taskId: task.id }))}>{t.t(task.status === 'scheduled' ? 'pause' : 'resume')}</Button>
                    <Confirm title={t.t('remove')} description={t.t('removeAutomationWarning')} locale={locale} disabled={state.busy} action={() => void state.run(() => mutate('automation-delete', { taskId: task.id }))} /></>}
            </div>
            {editing === task.id && (overview.canManage || task.runAsUserId === overview.userId) && <AutomationForm {...props} task={task} onSaved={() => { setEditing(null); void state.load() }} />}
            {task.pendingRunAsUserId && <p className="text-sm text-muted-foreground">{t.t('pendingRunAs')}: {overview.members.find((member) => member.id === task.pendingRunAsUserId)?.name || task.pendingRunAsUserId}</p>}
            {task.pendingRunAsUserId === overview.userId && <Button disabled={state.busy} onClick={() => void state.run(() => mutate('automation-accept', { taskId: task.id }))}>{t.t('acceptRunAs')}</Button>}
            {(overview.canManage || task.runAsUserId === overview.userId) && <div className="flex flex-wrap gap-2"><div className="min-w-48 flex-1"><Choice label={t.t('selectRunAs')} value={targets[task.id] || ''} disabled={state.busy}
                options={overview.members.filter((member) => member.id !== task.runAsUserId).map((member) => ({ value: member.id, label: member.name }))} onChange={(value) => setTargets({ ...targets, [task.id]: value })} /></div>
                <Button variant="outline" disabled={state.busy || !targets[task.id]} onClick={() => void state.run(() => mutate('automation-propose', { taskId: task.id, userId: targets[task.id] }))}>{t.t('proposeRunAs')}</Button></div>}
        </div>)}
        <Pager page={page} total={state.data?.total ?? 0} onPage={setPage} busy={state.busy} locale={locale} />
    </div>
}
