import { useState } from 'react'
import { z } from 'zod'
import { Button, Input, Checkbox } from '@xpert-ai/shadcn-ui'
import { action, mutate, useEditor, Status, Pager, Search, Confirm, type EditorProps } from './shared'
import { scopedRequest } from '../bridge'
import { configurationI18n } from '../i18n'
const catalogSchema = z.object({ items: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().nullish() })), total: z.number() })
export function SkillsEditor({ overview, locale }: EditorProps) {
    const t = configurationI18n(locale), [page, setPage] = useState(1), [search, setSearch] = useState('')
    const state = useEditor(() => overview.canEdit ? action('skill-catalog', { page, search }, catalogSchema) : Promise.resolve(null),
        [overview.canEdit, page, search])
    return <div className="space-y-4"><Status {...state} locale={locale} />
        {!overview.skills.length && <p className="text-sm text-muted-foreground">{t.t('empty')}</p>}
        {overview.skills.map((skill) => <div key={skill.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
            <div className="min-w-0 flex-1"><h3 className="text-sm font-medium">{skill.name}</h3><p className="text-xs text-muted-foreground">{skill.description}</p></div>
            <Checkbox aria-label={t.t('enableSkill', { name: skill.name })} checked={skill.enabled} disabled={!overview.canEdit || state.busy}
                onCheckedChange={(enabled) => void state.run(() => mutate('skill-toggle', { skillId: skill.id, enabled: enabled === true }))} />
            {overview.canEdit && <Confirm title={t.t('uninstall')} description={t.t('uninstallWarning', { name: skill.name })} locale={locale} disabled={state.busy}
                action={() => void state.run(() => mutate('skill-remove', { skillId: skill.id }))} />}
        </div>)}
        {overview.canEdit && <>
            <h3 className="font-medium">{t.t('uploadSkill')}</h3>
            <Input type="file" accept=".zip,application/zip" aria-label={t.t('uploadSkill')} disabled={state.busy} onChange={(event) => {
                const file = event.target.files?.[0], send = scopedRequest(); event.target.value = ''
                if (file) void state.run(async () => {
                    if (file.size > 25 * 1024 * 1024) throw Error(t.t('fileTooLarge'))
                    const result = z.object({ success: z.literal(true) }).parse(await send('executeFileAction', {
                        actionKey: 'skill-upload', input: {}, file: { name: file.name, type: file.type || 'application/zip', buffer: await file.arrayBuffer() }
                    }))
                    return result
                })
            }} />
            <h3 className="border-t pt-4 font-medium">{t.t('installSkill')}</h3>
            <Search value={search} onChange={(value) => { setSearch(value); setPage(1) }} locale={locale} />
            {state.data?.items.map((skill) => <div key={skill.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{skill.name}</p><p className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</p></div>
                <Button variant="outline" disabled={state.busy} onClick={() => void state.run(() => mutate('skill-install', { indexId: skill.id }))}>{t.t('install')}</Button></div>)}
            <Pager page={page} total={state.data?.total ?? 0} onPage={setPage} busy={state.busy} locale={locale} />
        </>}
    </div>
}
