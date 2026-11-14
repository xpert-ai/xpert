import { useEffect, useId, useState } from 'react'
import { ChevronDown, Plug, PlugZap } from 'lucide-react'
import { CatalogPanel, CatalogSearch, CatalogTrigger, EmptyMessage, SectionHeading } from './catalog-layout'
import { z } from 'zod'
import { Badge, Button, Input, Label } from '@xpert-ai/shadcn-ui'
import { action, mutate, useEditor, Status, Choice, Confirm, localized, labelSchema, type EditorProps } from './shared'
import { configurationI18n } from '../i18n'
const fieldSchema = z.object({ name: z.string(), label: labelSchema.optional(), type: z.string().optional(), required: z.boolean().optional(), secret: z.boolean().optional(), placeholder: labelSchema.optional() })
const formSchema = z.object({ fields: z.array(fieldSchema).default([]), defaultValues: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional() })
const methodSchema = z.object({ id: z.string(), type: z.string(), label: labelSchema.optional(), credentials: formSchema.optional(), appCredentials: formSchema.optional() })
const definitionSchema = z.object({ provider: z.string(), label: labelSchema, authMethods: z.array(methodSchema).optional(),
    auth: z.object({ type: z.string(), credentials: formSchema.optional(), appCredentials: formSchema.optional() }).optional() })
const bindingSchema = z.object({ id: z.string(), provider: z.string(), status: z.string(), authorizationMode: z.string(), authMethodId: z.string().nullish() })
const catalogSchema = z.object({ definitions: z.array(definitionSchema), bindings: z.array(bindingSchema) })
const connectionSchema = z.object({ status: z.string(), authorizationUrl: z.string().url().nullish(), stateExpiresAt: z.string().nullish() })
function ConnectorForm({ binding, definition, canManage, locale, refresh, initiallyOpen }: {
    binding: z.infer<typeof bindingSchema>; definition: z.infer<typeof definitionSchema>; canManage: boolean; locale: string; refresh: () => Promise<void>; initiallyOpen: boolean
}) {
    const t = configurationI18n(locale)
    const [open, setOpen] = useState(initiallyOpen)
    const fieldsId = useId()
    const methods = definition.authMethods ?? (definition.auth ? [{ id: definition.auth.type, ...definition.auth }] : [])
    const [methodId, setMethodId] = useState(binding.authMethodId || methods[0]?.id || '')
    const method = methods.find((item) => item.id === methodId), form = method?.type === 'oauth2' ? method.appCredentials : method?.credentials
    const [values, setValues] = useState<Record<string, string>>({}), [url, setUrl] = useState<string | null>(null)
    const [expiresAt, setExpiresAt] = useState(0)
    const state = useEditor(async () => null, [])
    useEffect(() => { setValues(Object.fromEntries(Object.entries(form?.defaultValues ?? {}).map(([key, value]) => [key, String(value)]))) }, [methodId])
    // Poll only while an authorization opened by this editor is pending; unmount cancels it.
    useEffect(() => {
        if (!url) return
        let disposed = false, timer: ReturnType<typeof setTimeout>
        const poll = async () => {
            if (Date.now() >= expiresAt) { setUrl(null); return }
            try {
                const result = await action('connector-status', { bindingId: binding.id }, z.object({ status: z.string() }))
                if (disposed) return
                if (result.status !== 'pending') { setUrl(null); await refresh(); return }
                timer = setTimeout(poll, 5000)
            } catch { if (!disposed) setUrl(null) }
        }
        timer = setTimeout(poll, 5000)
        return () => { disposed = true; clearTimeout(timer) }
    }, [url, binding.id])
    const label = localized(definition.label, locale) || binding.provider
    const status = ['active','pending','expired','error','disconnected'].includes(binding.status)
        ? binding.status as 'active' | 'pending' | 'expired' | 'error' | 'disconnected' : 'unknown'
    return <li className="py-3">
        <div className="flex flex-wrap items-center gap-2">
            <Plug aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <h3 className="min-w-0 flex-1 break-words text-sm font-medium">{label}</h3>
            <Badge variant="secondary">{t.t(status)}</Badge>
            {canManage && <Button size="sm" variant="outline" type="button" aria-expanded={open} aria-controls={fieldsId}
                onClick={() => setOpen(!open)}>{t.t('connectorSettings')}<ChevronDown aria-hidden="true" className={open ? 'rotate-180' : ''} /></Button>}
        </div>
        {canManage && open && <form id={fieldsId} className="mt-3 max-w-xl space-y-3 border-t pt-3" onSubmit={(event) => {
        event.preventDefault(); void state.run(async () => {
            const result = await action('connector-connect', { bindingId: binding.id, authMethodId: methodId, values }, connectionSchema)
            setValues({})
            if (result.authorizationUrl) { setUrl(result.authorizationUrl); setExpiresAt(result.stateExpiresAt ? Date.parse(result.stateExpiresAt) : Date.now() + 600000) }
            else await refresh()
        }, false)
    }}>
        <Status {...state} locale={locale} />
        <div className="space-y-1 text-sm"><span>{t.t('authenticationMethod')}</span>
            <Choice label={t.t('authenticationMethod')} value={methodId} options={methods.map((item) => ({ value: item.id, label: localized('label' in item ? item.label : undefined, locale) || item.id }))} onChange={setMethodId} disabled={state.busy} /></div>
            {form?.fields.map((field) => <div key={field.name} className="space-y-2"><Label htmlFor={`${binding.id}-${field.name}`}>{localized(field.label, locale) || field.name}</Label>
                <Input id={`${binding.id}-${field.name}`} type={field.type === 'password' || field.secret ? 'password' : 'text'} required={field.required} autoComplete="off" disabled={state.busy}
                    value={values[field.name] ?? ''} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} /></div>)}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={state.busy || !method}>{t.t('connect')}</Button>
                <Confirm title={t.t('remove')} description={t.t('removeConnectorWarning')} locale={locale} disabled={state.busy}
                    action={() => void state.run(async () => { await mutate('connector-remove', { bindingId: binding.id }); await refresh() }, false)} />
                {(url || binding.status === 'pending') && <Button variant="outline" type="button" disabled={state.busy} onClick={() => void state.run(async () => { await mutate('connector-cancel', { bindingId: binding.id }); setUrl(null); await refresh() }, false)}>{t.t('cancel')}</Button>}
            </div>
        {url && <a className="text-sm underline" href={url} target="_blank" rel="noopener noreferrer">{t.t('openAuthorization')}</a>}
        </form>}
    </li>
}
export function ConnectorsEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale)
    const id = useId()
    const state = useEditor(() => action('connectors', {}, catalogSchema), [])
    const [expanded, setExpanded] = useState(false)
    const [search, setSearch] = useState('')
    const [added, setAdded] = useState('')
    const [notice, setNotice] = useState('')
    const available = state.data?.definitions.filter((definition) =>
        !state.data?.bindings.some((binding) => binding.provider === definition.provider))
    const matching = available?.filter((definition) =>
        (localized(definition.label, locale) + ' ' + definition.provider).toLowerCase().includes(search.trim().toLowerCase()))
    return <div className="space-y-4">
        <SectionHeading title={t.t('connectors')} count={state.data?.bindings.length}>
            {overview.canManage && <CatalogTrigger label={t.t('addConnector')} icon={<PlugZap />} controls={id} expanded={expanded}
                onClick={() => { setExpanded(!expanded); setSearch(''); setNotice('') }} />}
        </SectionHeading>
        <Status {...state} locale={locale} />
        {state.error && <Button variant="outline" size="sm" onClick={() => void state.load()}>{t.t('retry')}</Button>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {overview.canManage && expanded && <CatalogPanel id={id} title={t.t('connectorCatalog')}>
            <CatalogSearch label={t.t('connectorSearch')} value={search} onChange={setSearch} />
            {matching && (matching.length ? <ul className="max-h-80 divide-y overflow-y-auto">
                {matching.map((definition) => {
                    const name = localized(definition.label, locale) || definition.provider
                    return <li key={definition.provider} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 break-words text-sm">{name}</span>
                        <Button size="sm" variant="outline" disabled={state.busy} onClick={() => void state.run(async () => {
                            await mutate('connector-add', { provider: definition.provider })
                            setAdded(definition.provider)
                            setExpanded(false)
                            setNotice(t.t('connectorAdded', { name }))
                        })}>{t.t('add')}</Button>
                    </li>
                })}
            </ul> : <EmptyMessage>{t.t(available?.length ? 'noResults' : 'noProviders')}</EmptyMessage>)}
        </CatalogPanel>}
        {state.data && (!state.data.bindings.length ? <EmptyMessage>{t.t('noConnectors')}</EmptyMessage> :
            <ul className="divide-y rounded-lg border px-3 sm:px-4">
                {state.data.bindings.map((binding) => {
                    const definition = state.data?.definitions.find((item) => item.provider === binding.provider)
                    return definition ? <ConnectorForm key={binding.id} binding={binding} definition={definition} initiallyOpen={binding.provider === added}
                        canManage={overview.canManage} locale={locale} refresh={state.load} /> :
                        <li key={binding.id} className="break-words py-3 text-sm text-muted-foreground">{binding.provider} · {t.t('unavailable')}</li>
                })}
            </ul>)}
    </div>
}
