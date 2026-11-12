import { useEffect, useState } from 'react'
import { z } from 'zod'
import { Button, Input, Label } from '@xpert-ai/shadcn-ui'
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
function ConnectorForm({ binding, definition, canManage, locale, refresh }: {
    binding: z.infer<typeof bindingSchema>; definition: z.infer<typeof definitionSchema>; canManage: boolean; locale: string; refresh: () => Promise<void>
}) {
    const t = configurationI18n(locale)
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
    return <form className="space-y-3 border-b pb-5" onSubmit={(event) => {
        event.preventDefault(); void state.run(async () => {
            const result = await action('connector-connect', { bindingId: binding.id, authMethodId: methodId, values }, connectionSchema)
            setValues({})
            if (result.authorizationUrl) { setUrl(result.authorizationUrl); setExpiresAt(result.stateExpiresAt ? Date.parse(result.stateExpiresAt) : Date.now() + 600000) }
            else await refresh()
        }, false)
    }}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{localized(definition.label, locale)}</h3>
            <span className="text-xs text-muted-foreground">{t.t(['active','pending','expired','error','disconnected'].includes(binding.status) ? binding.status as 'active' | 'pending' | 'expired' | 'error' | 'disconnected' : 'unknown')}</span></div>
        <Status {...state} locale={locale} />
        {canManage && <>
            <Choice label={t.t('authenticationMethod')} value={methodId} options={methods.map((item) => ({ value: item.id, label: localized('label' in item ? item.label : undefined, locale) || item.id }))} onChange={setMethodId} disabled={state.busy} />
            {form?.fields.map((field) => <div key={field.name} className="space-y-2"><Label htmlFor={`${binding.id}-${field.name}`}>{localized(field.label, locale) || field.name}</Label>
                <Input id={`${binding.id}-${field.name}`} type={field.type === 'password' || field.secret ? 'password' : 'text'} required={field.required} autoComplete="off" disabled={state.busy}
                    value={values[field.name] ?? ''} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} /></div>)}
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={state.busy || !method}>{t.t('connect')}</Button>
                <Confirm title={t.t('remove')} description={t.t('removeConnectorWarning')} locale={locale} disabled={state.busy}
                    action={() => void state.run(async () => { await mutate('connector-remove', { bindingId: binding.id }); await refresh() }, false)} />
                {(url || binding.status === 'pending') && <Button variant="outline" type="button" disabled={state.busy} onClick={() => void state.run(async () => { await mutate('connector-cancel', { bindingId: binding.id }); setUrl(null); await refresh() }, false)}>{t.t('cancel')}</Button>}
            </div>
        </>}
        {url && <a className="text-sm underline" href={url} target="_blank" rel="noopener noreferrer">{t.t('openAuthorization')}</a>}
    </form>
}
export function ConnectorsEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale), state = useEditor(() => action('connectors', {}, catalogSchema), []), [provider, setProvider] = useState('')
    return <div className="space-y-5"><Status {...state} locale={locale} />
        {state.data?.bindings.map((binding) => {
            const definition = state.data?.definitions.find((item) => item.provider === binding.provider)
            return definition ? <ConnectorForm key={binding.id} binding={binding} definition={definition} canManage={overview.canManage} locale={locale} refresh={state.load} />
                : <p key={binding.id} className="text-sm text-muted-foreground">{binding.provider} · {t.t('unavailable')}</p>
        })}
        {overview.canManage && <><Choice label={t.t('selectConnector')} value={provider} onChange={setProvider} disabled={state.busy}
            options={(state.data?.definitions ?? []).filter((definition) => !state.data?.bindings.some((binding) => binding.provider === definition.provider)).map((definition) => ({ value: definition.provider, label: localized(definition.label, locale) }))} />
            <Button disabled={state.busy || !provider} onClick={() => void state.run(() => mutate('connector-add', { provider }))}>{t.t('add')}</Button></>}
    </div>
}
