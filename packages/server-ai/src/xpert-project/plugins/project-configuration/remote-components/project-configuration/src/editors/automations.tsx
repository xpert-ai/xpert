import { useEffect, useId, useRef, useState } from 'react'
import { CalendarPlus, Clock3, UserRound } from 'lucide-react'
import { CatalogPanel, CatalogTrigger, EmptyMessage, SectionHeading } from './catalog-layout'
import { z } from 'zod'
import { Badge, Button, DatePicker, TimePicker, TimeZonePicker, Input, Label, Textarea, Checkbox } from '@xpert-ai/shadcn-ui'
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
function AutomationForm({ task, overview, locale, onSaved, onCancel }: EditorProps & { task?: Task; onSaved: () => void; onCancel: () => void }) {
    const t = configurationI18n(locale), canManage = overview.canManage
    const [name, setName] = useState(task?.name || ''), [prompt, setPrompt] = useState(task?.prompt || '')
    const [xpertId, setXpertId] = useState(task?.xpertId || overview.experts[0]?.id || '')
    const [options, setOptions] = useState<z.infer<typeof optionsSchema>>(task?.options || { frequency: 'Daily', time: '09:00' })
    const needsDate = options.frequency === 'Once' || options.frequency === 'Yearly'
    const [dateMissing, setDateMissing] = useState(false)
    const dateTrigger = useRef<HTMLButtonElement>(null)
    const [timeZone, setTimeZone] = useState(task?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone)
    const [runtime, setRuntime] = useState<ProjectConfigurationValues>(task?.runtimeState || {})
    const [bindings, setBindings] = useState(taskConnectorIds(task?.runtimeState || {}))
    const state = useEditor(() => xpertId ? action('automation-options', { xpertId, ...(task?.agentKey ? { agentKey: task.agentKey } : {}) }, capabilitiesSchema) : Promise.resolve(null), [xpertId])
    return <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault()
        if (canManage && needsDate && !options.date) {
            setDateMissing(true)
            dateTrigger.current?.focus()
            return
        }
        void state.run(async () => {
            const runtimeState = withTaskConnectors(runtime, bindings)
            const [, month, dayOfMonth] = (options.date ?? '').split('-').map(Number)
            const schedule = options.frequency === 'Yearly' ? { ...options, month, dayOfMonth } : options
            if (canManage) await mutate('automation-save', { ...(task ? { taskId: task.id } : {}), name, prompt, xpertId,
                ...(state.data?.capabilities.agentKey ? { agentKey: state.data.capabilities.agentKey } : {}), options: schedule, timeZone, runtimeState })
            else if (task) await mutate('automation-connectors', { taskId: task.id, runtimeState })
            onSaved()
        }, false)
    }}>
        <Status {...state} locale={locale} />
        {canManage && <>
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="automation-name">{t.t('name')}</Label>
                    <Input id="automation-name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} disabled={state.busy} /></div>
                <div className="space-y-1.5"><span className="text-sm font-medium">{t.t('selectExpert')}</span>
                    <Choice label={t.t('selectExpert')} value={xpertId} onChange={(value) => { setXpertId(value); setBindings([]); setRuntime({}) }}
                        options={overview.experts.map((expert) => ({ value: expert.id, label: expert.name }))} disabled={state.busy || !!task} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="automation-prompt">{t.t('prompt')}</Label>
                <Textarea id="automation-prompt" required value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={state.busy} /></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5"><span className="text-sm font-medium">{t.t('frequency')}</span>
                    <Choice label={t.t('frequency')} value={options.frequency} onChange={(value) => {
                        const frequency = optionsSchema.shape.frequency.parse(value)
                        setDateMissing(false)
                        setOptions({ frequency, time: options.time, ...(frequency === 'Weekly' ? { dayOfWeek: 1 } : {}) })
                    }} options={optionsSchema.shape.frequency.options.map((value) => ({ value, label: t.t(value) }))} disabled={state.busy} /></div>
                <TimePicker locale={locale} value={options.time} disabled={state.busy}
                    onChange={(time) => setOptions({ ...options, time })} />
                {needsDate && <DatePicker locale={locale} value={options.date} disabled={state.busy}
                    triggerRef={dateTrigger} error={dateMissing ? t.t('dateRequired') : undefined}
                    onChange={(date) => { setOptions({ ...options, date }); setDateMissing(false) }} />}
                {options.frequency === 'Weekly' && <div className="space-y-1.5"><span className="text-sm font-medium">{t.t('dayOfWeek')}</span>
                    <Choice label={t.t('dayOfWeek')} value={options.dayOfWeek === undefined ? '' : String(options.dayOfWeek)}
                        onChange={(value) => setOptions({ ...options, dayOfWeek: Number(value) })}
                        options={Array.from({ length: 7 }, (_, day) => ({ value: String(day), label: new Intl.DateTimeFormat(t.locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 8 + day))) }))} disabled={state.busy} /></div>}
                {options.frequency === 'Monthly' && <div className="space-y-1.5"><Label htmlFor="automation-day">{t.t('dayOfMonth')}</Label>
                    <Input id="automation-day" type="number" min={1} max={31} required value={options.dayOfMonth ?? ''}
                        onChange={(event) => setOptions({ ...options, dayOfMonth: event.target.value ? event.target.valueAsNumber : undefined })} disabled={state.busy} /></div>}
                <TimeZonePicker value={timeZone} locale={locale} onChange={setTimeZone} disabled={state.busy} />
            </div>
            {state.data?.capabilities.stateSchema && <SchemaForm schema={state.data.capabilities.stateSchema} values={runtime} onChange={setRuntime} locale={locale} disabled={state.busy} />}
        </>}
        {!!state.data?.connectors.items.length && <h4 className="text-sm font-medium">{t.t('connectors')}</h4>}
        {state.data?.connectors.items.map((connector) => <label key={connector.bindingId} className="flex items-center gap-2 text-sm">
            <Checkbox checked={bindings.includes(connector.bindingId)} disabled={state.busy} onCheckedChange={(checked) => setBindings(checked === true ? [...bindings, connector.bindingId] : bindings.filter((id) => id !== connector.bindingId))} />
            {localized(connector.label, locale)}</label>)}
        <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button disabled={state.busy || !xpertId || !state.data} type="submit">{t.t('saveSettings')}</Button>
            <Button type="button" variant="outline" disabled={state.busy} onClick={onCancel}>{t.t('cancel')}</Button>
            {state.error && !state.data && <Button type="button" variant="outline" onClick={() => void state.load()}>{t.t('retry')}</Button>}
        </div>
    </form>
}
export function AutomationsEditor(props: EditorProps) {
    const { overview, locale } = props, t = configurationI18n(locale), [page, setPage] = useState(1)
    const [editing, setEditing] = useState<string | null>(null), [targets, setTargets] = useState<Record<string, string>>({})
    const state = useEditor(() => action('automations', { page }, pageSchema), [page])
    const panelId = useId()
    const total = state.data?.total
    useEffect(() => {
        if (total !== undefined && page > 1 && (page - 1) * 20 >= total) setPage(Math.max(1, Math.ceil(total / 20)))
    }, [page, total])
    function saved() {
        setEditing(null)
        if (editing === 'new' && page !== 1) setPage(1)
        else void state.load()
    }
    return <div className="space-y-4">
        <SectionHeading title={t.t('automations')} count={total ?? overview.automationTotal}>
            {overview.canManage && <CatalogTrigger label={t.t('addAutomation')} icon={<CalendarPlus aria-hidden="true" />}
                controls={panelId} expanded={editing === 'new'} onClick={() => setEditing(editing === 'new' ? null : 'new')} />}
        </SectionHeading>
        <Status {...state} locale={locale} />
        {state.error && <Button variant="outline" size="sm" onClick={() => void state.load()}>{t.t('retry')}</Button>}
        {overview.canManage && editing === 'new' && <CatalogPanel id={panelId} title={t.t('addAutomation')}>
            {overview.experts.length ? <AutomationForm {...props} onSaved={saved} onCancel={() => setEditing(null)} /> :
                <EmptyMessage>{t.t('automationNeedsExpert')}</EmptyMessage>}
        </CatalogPanel>}
        {total === 0 && <EmptyMessage>{t.t('noAutomations')}</EmptyMessage>}
        {!!state.data?.items.length && <ul className="divide-y rounded-lg border px-3 sm:px-4">
        {state.data.items.map((task) => <li key={task.id} className="min-w-0 space-y-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="min-w-0 break-words text-sm font-semibold">{task.name || task.prompt}</h3>
                        <Badge variant="secondary">{t.t(task.status === 'scheduled' || task.status === 'paused' || task.status === 'archived' ? task.status : 'unknown')}</Badge></div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {(task.scheduleDescription || task.options.date) && <span className="inline-flex flex-wrap items-center gap-1">
                            <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
                            {task.options.frequency === 'Once' && task.options.date
                                ? <>{t.t('Once')} · <time dateTime={`${task.options.date}T${task.options.time}`}>{task.options.date} {task.options.time}</time></>
                                : task.scheduleDescription}
                            {task.timeZone && <span>({task.timeZone})</span>}
                        </span>}
                        <span className="inline-flex items-center gap-1"><UserRound aria-hidden="true" className="size-3.5 shrink-0" />{t.t('runAs')}: {overview.members.find((member) => member.id === task.runAsUserId)?.name || task.runAsUserId}</span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {(overview.canManage || task.runAsUserId === overview.userId) && <Button size="sm" variant="outline" disabled={state.busy}
                        aria-expanded={editing === task.id} onClick={() => setEditing(editing === task.id ? null : task.id)}>{t.t('edit')}</Button>}
                    {overview.canManage && <>
                        {['scheduled', 'paused', 'archived'].includes(task.status) && <Button size="sm" variant="outline" disabled={state.busy}
                            onClick={() => void state.run(() => mutate(task.status === 'scheduled' ? 'automation-pause' : 'automation-resume', { taskId: task.id }))}>
                            {t.t(task.status === 'scheduled' ? 'pause' : 'resume')}</Button>}
                        <Confirm title={t.t('remove')} description={t.t('removeAutomationWarning')} locale={locale} disabled={state.busy}
                            action={() => void state.run(() => mutate('automation-delete', { taskId: task.id }))} />
                    </>}
                </div>
            </div>
            {editing === task.id && (overview.canManage || task.runAsUserId === overview.userId) && <CatalogPanel id={panelId + task.id} title={t.t('editAutomation')}>
                <AutomationForm {...props} task={task} onSaved={saved} onCancel={() => setEditing(null)} />
            </CatalogPanel>}
            {task.pendingRunAsUserId && <p className="text-sm text-muted-foreground">{t.t('pendingRunAs')}: {overview.members.find((member) => member.id === task.pendingRunAsUserId)?.name || task.pendingRunAsUserId}</p>}
            {task.pendingRunAsUserId === overview.userId && <Button disabled={state.busy} onClick={() => void state.run(() => mutate('automation-accept', { taskId: task.id }))}>{t.t('acceptRunAs')}</Button>}
            {(overview.canManage || task.runAsUserId === overview.userId) && overview.members.some((member) => member.id !== task.runAsUserId) && <div className="flex flex-wrap items-center gap-2 border-t pt-3"><div className="w-full sm:w-60"><Choice label={t.t('selectRunAs')} value={targets[task.id] || ''} disabled={state.busy}
                options={overview.members.filter((member) => member.id !== task.runAsUserId).map((member) => ({ value: member.id, label: member.name }))} onChange={(value) => setTargets({ ...targets, [task.id]: value })} /></div>
                <Button variant="outline" disabled={state.busy || !targets[task.id]} onClick={() => void state.run(() => mutate('automation-propose', { taskId: task.id, userId: targets[task.id] }))}>{t.t('proposeRunAs')}</Button></div>}
        </li>)}
        </ul>}
        <Pager page={page} total={state.data?.total ?? 0} onPage={setPage} busy={state.busy} locale={locale} />
    </div>
}
