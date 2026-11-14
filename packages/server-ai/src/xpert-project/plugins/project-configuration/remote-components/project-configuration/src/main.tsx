import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Button, Tabs, TabsContent, TabsHeader, TabsList, TabsTrigger, Textarea } from '@xpert-ai/shadcn-ui'
import { Clock3, FolderOpen, RefreshCw, UserRound, UsersRound } from 'lucide-react'
import { z } from 'zod'
import type { ProjectConfigurationOverview, ProjectConfigurationSection } from '@xpert-ai/contracts'
import { connect, request } from './bridge'
import { ConfigurationEditor } from './editors/editor'
import { EditorPageContext, mutate } from './editors/shared'
import { configurationI18n } from './i18n'
import { projectConfigurationOverviewSchema } from './model'

const response = z.object({ item: projectConfigurationOverviewSchema })
const pages = ['instructions', 'type', 'experts', 'members', 'skills', 'connectors', 'automations', 'delete'] as const
type Page = ProjectConfigurationSection | 'instructions'

function ProjectPage({ locale }: { locale: string }) {
    const t = configurationI18n(locale)
    const [overview, setOverview] = useState<ProjectConfigurationOverview | null>(null)
    const [active, setActive] = useState<Page>('instructions')
    const [visited, setVisited] = useState<Partial<Record<Page, boolean>>>({ instructions: true })
    const [revisions, setRevisions] = useState<Partial<Record<Page, number>>>({})
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [deleted, setDeleted] = useState(false)
    const [draft, setDraft] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')
    const [saved, setSaved] = useState(false)
    const sequence = useRef(0)
    const mounted = useRef(false)

    const load = useCallback(async () => {
        if (!mounted.current) return
        const version = ++sequence.current
        setLoading(true)
        setError('')
        try {
            const { item } = response.parse(await request('requestData'))
            if (sequence.current !== version) return
            setOverview(item)
            if (!item.canEdit) setDraft(null)
            if (!item.isOwner) setActive((page) => page === 'delete' ? 'instructions' : page)
        } catch (reason) {
            if (sequence.current === version) setError(reason instanceof Error ? reason.message : 'Request failed')
        } finally {
            if (sequence.current === version) setLoading(false)
        }
    }, [])

    useEffect(() => {
        mounted.current = true
        void load()
        return () => { mounted.current = false; sequence.current++ }
    }, [load])

    function refresh() {
        setRevisions((current) => ({ ...current, [active]: (current[active] ?? 0) + 1 }))
        void load()
    }
    function select(value: string) {
        const page = pages.find((key) => key === value)
        if (!page || (page === 'delete' && !overview?.isOwner)) return
        setVisited((current) => ({ ...current, [page]: true }))
        setActive(page)
    }

    const dirty = draft !== null && draft !== overview?.instruction
    async function saveInstructions() {
        if (!overview?.canEdit || draft === null || !dirty || saving) return
        setSaving(true)
        setSaveError('')
        try {
            await mutate('instructions', { content: draft })
            if (!mounted.current) return
            setOverview((current) => current && { ...current, instruction: draft })
            setDraft(null)
            setSaved(true)
            void load()
        } catch (reason) {
            if (mounted.current) setSaveError(reason instanceof Error ? reason.message : t.t('failed'))
        } finally {
            if (mounted.current) setSaving(false)
        }
    }

    if (deleted) return <main className="p-6 text-foreground" role="status">{t.t('deleted')}</main>
    const available = pages.filter((page) => page !== 'delete' || overview?.isOwner)
    const owner = overview?.members.find((member) => member.role === 'owner')
    return (
        <main className="flex h-full min-w-0 flex-col bg-background text-foreground">
            <header className="shrink-0 border-b bg-muted/25">
                <div className="mx-auto max-w-5xl px-4 py-4 sm:px-7 sm:py-5">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-background text-primary sm:size-12">
                            <FolderOpen className="size-5 sm:size-6" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                            {overview && <p className="mb-0.5 text-xs font-medium text-muted-foreground">{t.t('title')}</p>}
                            <h1 className="break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                                {overview?.name || t.t('title')}
                            </h1>
                        </div>
                        <Button variant="ghost" size="sm" aria-label={t.t('refresh')} disabled={loading || saving} onClick={refresh}>
                            <RefreshCw className="size-4" /><span className="hidden sm:inline">{t.t('refresh')}</span>
                        </Button>
                    </div>
                    {overview && (
                        <dl className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
                            {owner && <div className="flex min-w-0 items-center gap-1.5">
                                <UserRound aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                                <dt className="text-muted-foreground">{t.t('owner')}</dt><dd className="break-words font-medium">{owner.name}</dd>
                            </div>}
                            <div className="flex items-center gap-1.5">
                                <UsersRound aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                <dt className="text-muted-foreground">{t.t('tabMembers')}</dt><dd className="font-medium">{t.number(overview.members.length)}</dd>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Clock3 aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                <dt className="text-muted-foreground">{t.t('taskLimit')}</dt>
                                <dd className="font-medium">{t.t('hours', { hours: t.number(overview.effectiveMaxDurationSeconds / 3600) })}</dd>
                            </div>
                        </dl>
                    )}
                    {overview && !overview.canEdit && <Badge variant="secondary" className="mt-2">{t.t('readonly')}</Badge>}
                </div>
            </header>
            {error && <div role="alert" className="flex items-center gap-3 px-4 py-2 text-sm text-destructive">
                {error}<Button variant="outline" size="sm" onClick={refresh}>{t.t('retry')}</Button>
            </div>}
            {!overview && loading && <p role="status" className="p-4 text-sm text-muted-foreground">{t.t('loading')}</p>}
            {overview && (
                <Tabs value={active} onValueChange={select} activationMode="manual" className="min-h-0 flex-1 gap-0">
                    <div className="shrink-0 border-b">
                        <TabsHeader className="mx-auto max-w-5xl overflow-x-auto border-0 px-4 sm:px-7">
                            <TabsList variant="line" aria-label={t.t('title')} className="shrink-0">
                                {available.map((page) => <TabsTrigger key={page} value={page} className="px-3">
                                    {t.t(tabLabels[page])}
                                </TabsTrigger>)}
                            </TabsList>
                        </TabsHeader>
                    </div>
                    {available.map((page) => (
                        <TabsContent key={page} value={page} forceMount hidden={active !== page} className="min-h-0 min-w-0 overflow-y-auto">
                            {visited[page] && <div className="mx-auto max-w-5xl px-4 py-5 sm:px-7 sm:py-6">
                                {!['experts', 'members', 'skills', 'connectors', 'automations'].includes(page) && <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className="text-lg font-semibold">{t.t(page)}</h2>
                                </div>}
                                {page === 'instructions' ? (
                                    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void saveInstructions() }}>
                                        <Textarea aria-label={t.t(page)} className="min-h-44" disabled={!overview.canEdit || saving}
                                            value={draft ?? overview.instruction}
                                            onChange={(event) => { setDraft(event.target.value); setSaved(false); setSaveError('') }} />
                                        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
                                        {overview.canEdit && <div className="flex flex-wrap items-center gap-3">
                                            <Button type="submit" disabled={!dirty || saving}>{t.t(saving ? 'saving' : 'save')}</Button>
                                            {saved && <span role="status" className="text-sm text-muted-foreground">{t.t('saved')}</span>}
                                            {dirty && <span className="text-sm text-muted-foreground">{t.t('dirty')}</span>}
                                        </div>}
                                    </form>
                                ) : (
                                    <EditorPageContext.Provider value={{ revision: revisions[page] ?? 0, onChanged: load }}>
                                        <ConfigurationEditor section={page} overview={overview} locale={locale} onDeleted={() => setDeleted(true)} />
                                    </EditorPageContext.Provider>
                                )}
                            </div>}
                        </TabsContent>
                    ))}
                </Tabs>
            )}
        </main>
    )
}

const tabLabels = {
    instructions: 'tabInstructions', type: 'type', experts: 'tabExperts', members: 'tabMembers',
    skills: 'tabSkills', connectors: 'tabConnectors', automations: 'tabAutomations', delete: 'delete'
} as const satisfies Record<Page, string>

function App() {
    const [locale, setLocale] = useState('en-US')
    const [scope, setScope] = useState(0)
    useEffect(() => {
        const reset = () => setScope((current) => current + 1)
        return connect((language, changed) => { setLocale(language); if (changed) reset() }, reset)
    }, [])
    return scope ? <ProjectPage key={scope} locale={locale} /> : null
}

createRoot(document.getElementById('root')!).render(<App />)
