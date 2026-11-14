import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@xpert-ai/shadcn-ui'
import { action, mutate, useEditor, Status, Pager, Confirm, type EditorProps } from './shared'
import { configurationI18n } from '../i18n'
const pageSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })), total: z.number() })
export function ExpertsEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale), [page, setPage] = useState(1)
    const state = useEditor(() => overview.canManage ? action('experts', { page }, pageSchema) : Promise.resolve(null),
        [overview.canManage, page])
    return <div className="space-y-4"><Status {...state} locale={locale} />
        {!overview.experts.length && <p className="text-sm text-muted-foreground">{t.t('empty')}</p>}
        {overview.experts.map((expert) => <div key={expert.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <span>{expert.name}</span><div className="flex gap-2">{overview.canManage && <Confirm title={t.t('remove')} description={t.t('removeExpertWarning', { name: expert.name })} locale={locale} disabled={state.busy}
                action={() => void state.run(() => mutate('expert-remove', { xpertId: expert.id }))} />}</div></div>)}
        {overview.canManage && state.data && <><h3 className="font-medium">{t.t('addExpert')}</h3>
            {state.data.items.filter((item) => !overview.experts.some((expert) => expert.id === item.id)).map((expert) => <div key={expert.id} className="flex items-center justify-between gap-2">
                <span>{expert.name}</span><Button variant="outline" disabled={state.busy} onClick={() => void state.run(() => mutate('expert-add', { xpertId: expert.id }))}>{t.t('add')}</Button></div>)}
            <Pager page={page} total={state.data.total} onPage={setPage} busy={state.busy} locale={locale} /></>}
    </div>
}
