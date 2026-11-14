import { useId, useRef, useState } from 'react'
import { Check, PackagePlus, Upload } from 'lucide-react'
import { z } from 'zod'
import { Badge, Button, Checkbox } from '@xpert-ai/shadcn-ui'
import { action, mutate, useEditor, Status, Pager, Confirm, type EditorProps } from './shared'
import { CatalogPanel, CatalogSearch, CatalogTrigger, EmptyMessage, SectionHeading } from './catalog-layout'
import { scopedRequest } from '../bridge'
import { configurationI18n } from '../i18n'

const catalogSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullish() })), total: z.number() })

export function SkillsEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale)
    const id = useId()
    const upload = useRef<HTMLInputElement>(null)
    const [expanded, setExpanded] = useState(false)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [notice, setNotice] = useState('')
    const showCatalog = overview.canEdit && expanded
    const state = useEditor(() => showCatalog ? action('skill-catalog', { page, search }, catalogSchema) : Promise.resolve(null),
        [showCatalog, page, search])
    const installed = new Set(overview.skills.map((skill) => skill.skillIndexId))
    return <div className="space-y-4">
        <SectionHeading title={t.t('skills')} count={overview.skills.length}>
            {overview.canEdit && <>
                <Button type="button" size="sm" variant="outline" disabled={state.busy} onClick={() => upload.current?.click()}><Upload />{t.t('uploadSkill')}</Button>
                <input type="file" ref={upload} hidden accept=".zip,application/zip" aria-label={t.t('uploadSkill')} onChange={(event) => {
                    const file = event.target.files?.[0], send = scopedRequest()
                    event.target.value = ''
                    if (file) void state.run(async () => {
                        if (file.size > 25 * 1024 * 1024) throw Error(t.t('fileTooLarge'))
                        z.object({ success: z.literal(true) }).parse(await send('executeFileAction', {
                            actionKey: 'skill-upload', input: {}, file: { name: file.name, type: file.type || 'application/zip', buffer: await file.arrayBuffer() }
                        }))
                    })
                }} />
                <CatalogTrigger label={t.t('installSkill')} icon={<PackagePlus />} controls={id} expanded={expanded}
                    onClick={() => { setExpanded(!expanded); setPage(1); setSearch(''); setNotice('') }} />
            </>}
        </SectionHeading>
        <Status {...state} locale={locale} />
        {state.error && <Button variant="outline" size="sm" onClick={() => void state.load()}>{t.t('retry')}</Button>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {showCatalog && <CatalogPanel id={id} title={t.t('skillCatalog')}>
            <CatalogSearch label={t.t('skillSearch')} value={search} onChange={(value) => { setSearch(value); setPage(1); setNotice('') }} />
            {state.data && <>
                <ul className="max-h-80 divide-y overflow-y-auto">
                    {state.data.items.map((skill) => <li key={skill.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0"><span className="break-words text-sm font-medium">{skill.name}</span>
                            {skill.description && <p className="line-clamp-2 break-words text-xs text-muted-foreground">{skill.description}</p>}</div>
                        {installed.has(skill.id) ? <Badge variant="secondary"><Check />{t.t('installed')}</Badge> :
                            <Button size="sm" variant="outline" disabled={state.busy} onClick={() => void state.run(async () => {
                                await mutate('skill-install', { indexId: skill.id })
                                setNotice(t.t('skillInstalled', { name: skill.name }))
                            })}>{t.t('install')}</Button>}
                    </li>)}
                </ul>
                {state.data.total === 0 && <EmptyMessage>{t.t(search.trim() ? 'noResults' : 'noCatalogSkills')}</EmptyMessage>}
                <Pager page={page} total={state.data.total} onPage={setPage} busy={state.busy} locale={locale} />
            </>}
        </CatalogPanel>}
        {!overview.skills.length ? <EmptyMessage>{t.t('noSkills')}</EmptyMessage> :
            <ul className="divide-y rounded-lg border px-3 sm:px-4">
                {overview.skills.map((skill) => <li key={skill.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-32 flex-1"><h3 className="break-words text-sm font-medium">{skill.name}</h3><p className="break-words text-xs text-muted-foreground">{skill.description}</p></div>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox aria-label={t.t('enableSkill', { name: skill.name })} checked={skill.enabled} disabled={!overview.canEdit || state.busy}
                            onCheckedChange={(enabled) => void state.run(() => mutate('skill-toggle', { skillId: skill.id, enabled: enabled === true }))} />
                        {t.t(skill.enabled ? 'enabled' : 'disabled')}
                    </label>
                    {overview.canEdit && <Confirm title={t.t('uninstall')} description={t.t('uninstallWarning', { name: skill.name })} locale={locale} disabled={state.busy}
                        action={() => void state.run(() => mutate('skill-remove', { skillId: skill.id }))} />}
                </li>)}
            </ul>}
    </div>
}
