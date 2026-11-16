import { useEffect, useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@xpert-ai/shadcn-ui'
import { CatalogPanel, CatalogSearch, CatalogTrigger, EmptyMessage, SectionHeading } from './catalog-layout'
import { action, mutate, useEditor, Status, Pager, Confirm, type EditorProps } from './shared'
import { configurationI18n } from '../i18n'

const pageSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })), total: z.number() })

export function ExpertsEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale)
    const pickerId = useId()
    const [expanded, setExpanded] = useState(false)
    const [search, setSearch] = useState('')
    const [page, setPage] = useState(1)
    const [notice, setNotice] = useState('')
    const showPicker = expanded && overview.canManage
    const state = useEditor(() => showPicker ? action('experts', { page, search }, pageSchema) : Promise.resolve(null),
        [showPicker, page, search])
    const total = state.data?.total
    useEffect(() => {
        if (total !== undefined && page > 1 && (page - 1) * 20 >= total) setPage(Math.max(1, Math.ceil(total / 20)))
    }, [total, page])

    function changeSearch(value: string) {
        setSearch(value)
        setPage(1)
        setNotice('')
    }

    return <div className="space-y-4">
        <SectionHeading title={t.t('experts')} count={overview.experts.length}>
            {overview.canManage && <CatalogTrigger label={t.t('addExpert')} icon={<Plus aria-hidden="true" />}
                expanded={showPicker} controls={pickerId} onClick={() => { setExpanded(!expanded); changeSearch('') }} />}
        </SectionHeading>
        <Status {...state} locale={locale} />
        {showPicker && state.error && <Button variant="outline" size="sm" onClick={() => void state.load()}>{t.t('retry')}</Button>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {showPicker && <CatalogPanel id={pickerId} title={t.t('expertCatalog')}>
            <CatalogSearch label={t.t('expertSearch')} value={search} onChange={changeSearch} />
            {state.data && <>
                <ul className="max-h-80 divide-y overflow-y-auto">
                    {state.data.items.map((expert) => <li key={expert.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 break-words text-sm">{expert.name}</span>
                        <Button size="sm" variant="outline" disabled={state.busy} onClick={() => void state.run(async () => {
                            await mutate('expert-add', { xpertId: expert.id })
                            setNotice(t.t('expertAdded', { name: expert.name }))
                        })}>{t.t('add')}</Button>
                    </li>)}
                </ul>
                {total === 0 && !state.busy && !state.error && <EmptyMessage>
                    {t.t(search.trim() ? 'noMatchingExperts' : 'noAvailableExperts')}
                </EmptyMessage>}
                <Pager page={page} total={state.data.total} onPage={setPage} busy={state.busy} locale={locale} />
            </>}
        </CatalogPanel>}
        {overview.experts.length ? <ul aria-label={t.t('experts')} className="divide-y rounded-lg border px-3 sm:px-4">
            {overview.experts.map((expert) => <li key={expert.id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0 break-words text-sm font-medium">{expert.name}</span>
                {overview.canManage && <Confirm title={t.t('remove')} description={t.t('removeExpertWarning', { name: expert.name })}
                    locale={locale} disabled={state.busy} action={() => void state.run(async () => {
                        await mutate('expert-remove', { xpertId: expert.id })
                        setNotice('')
                    })} />}
            </li>)}
        </ul> : <EmptyMessage>{t.t('noProjectExperts')}</EmptyMessage>}
    </div>
}
