import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { z } from 'zod'
import { Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, AlertDialog, AlertDialogTrigger,
    AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@xpert-ai/shadcn-ui'
import { request } from '../bridge'
import { configurationI18n } from '../i18n'
import type { ProjectConfigurationOverview } from '@xpert-ai/contracts'
export type EditorProps = { overview: ProjectConfigurationOverview; locale: string; onDeleted: () => void }
export const labelSchema = z.union([z.string(), z.object({ en_US: z.string().optional(), zh_Hans: z.string().optional() }).passthrough()])
export function localized(value: z.infer<typeof labelSchema> | undefined, locale: string) {
    if (typeof value === 'string') return value
    return configurationI18n(locale).locale === 'zh-Hans' ? value?.zh_Hans || value?.en_US || '' : value?.en_US || ''
}
export async function action<T, I>(key: string, input: object, schema: z.ZodType<T, z.ZodTypeDef, I>): Promise<T> {
    const response = z.object({ success: z.boolean(), message: z.string().optional(), data: z.unknown().optional() }).parse(
        await request('executeAction', { actionKey: key, input }))
    if (!response.success) throw Error(response.message || 'Request failed')
    return schema.parse(response.data)
}
export const mutate = (key: string, input: object) => action(key, input, z.unknown())
export const EditorPageContext = createContext({ revision: 0, onChanged: () => {} })
export function useEditor<T>(loader: () => Promise<T>, dependencies: readonly (string | number | boolean | undefined)[]) {
    const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false)
    const generation = useRef(0)
    const { revision, onChanged } = useContext(EditorPageContext)
    const load = async () => {
        const version = ++generation.current
        setBusy(true); setError('')
        try { const value = await loader(); if (version === generation.current) setData(value) }
        catch (error) { if (version === generation.current) setError(error instanceof Error ? error.message : 'Request failed') }
        finally { if (version === generation.current) setBusy(false) }
    }
    useEffect(() => { setData(null); void load(); return () => { generation.current++ } }, [...dependencies, revision])
    const run = async (operation: () => Promise<unknown>, refresh = true) => {
        if (busy) return
        const version = generation.current
        setBusy(true); setError('')
        try {
            await operation()
            await onChanged()
            if (version !== generation.current) return
            if (refresh) await load()
        } catch (error) { if (version === generation.current) setError(error instanceof Error ? error.message : 'Request failed') }
        finally { if (version === generation.current) setBusy(false) }
    }
    return { data, setData, error, busy, load, run }
}
export function Status({ error, busy, locale }: { error: string; busy: boolean; locale: string }) {
    const t = configurationI18n(locale)
    return <>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{busy && <p role="status" className="text-sm text-muted-foreground">{t.t('working')}</p>}</>
}
export function Choice({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
    return <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label={label} className="w-full"><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>{options.filter((item) => item.value).map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
}
export function Confirm({ title, description, locale, disabled, action, children }: { title: string; description: string; locale: string; disabled?: boolean; action: () => void; children?: ReactNode }) {
    const t = configurationI18n(locale)
    return <AlertDialog><AlertDialogTrigger asChild><Button type="button" variant="outline" disabled={disabled}>{children || title}</Button></AlertDialogTrigger>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription></AlertDialogHeader>
            <AlertDialogFooter><AlertDialogCancel>{t.t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={action}>{t.t('confirm')}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent></AlertDialog>
}
export function Pager({ page, total, onPage, busy, locale }: { page: number; total: number; onPage: (page: number) => void; busy: boolean; locale: string }) {
    const t = configurationI18n(locale)
    if (page <= 1 && total <= 20) return null
    return <div className="flex items-center justify-end gap-2"><Button variant="outline" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>{t.t('previous')}</Button>
        <span className="text-xs text-muted-foreground">{t.number(page)} / {t.number(Math.max(1, Math.ceil(total / 20)))}</span>
        <Button variant="outline" disabled={busy || page * 20 >= total} onClick={() => onPage(page + 1)}>{t.t('next')}</Button></div>
}
