import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import { ArrowDown, ArrowUpRight, Folder, RefreshCw, Search, UserRound } from 'lucide-react'
import { Badge, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsHeader, TabsList, TabsTrigger } from '@xpert-ai/shadcn-ui'
import { PROJECT_CONFIGURATION_VIEW, WORKBENCH_ASSISTANT_PROJECT_TARGET } from '@xpert-ai/contracts'
import { connect, request } from '../../../plugins/project-configuration/remote-components/project-configuration/src/bridge'
import { directory, labels, typeKey, typeLabel, type Project, type ProjectType } from './model'

const pageSize = 25
const tasksView = 'platform.project-tasks__timeline'
const commandResult = z.object({ success: z.boolean(), message: z.string().optional() })

function Directory({ locale }: { locale: string }) {
    const t = labels(locale)
    const [tab, setTab] = useState('all')
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    const [type, setType] = useState<ProjectType | null>(null)
    const [page, setPage] = useState(1)
    const [revision, setRevision] = useState(0)
    const [data, setData] = useState<z.infer<typeof directory>>()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [opening, setOpening] = useState<string>()
    const [navigationError, setNavigationError] = useState('')

    useEffect(() => {
        const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1) }, 200)
        return () => window.clearTimeout(timer)
    }, [search])

    useEffect(() => {
        let current = true
        setLoading(true)
        setError('')
        setNavigationError('')
        const parameters = {
            manageableOnly: tab === 'manageable',
            ...(type && (type.applicationKey && type.projectTypeKey
                ? { applicationKey: type.applicationKey, projectTypeKey: type.projectTypeKey } : { unclassified: true }))
        }
        request('requestData', { query: { page, pageSize, search: query, parameters } })
            .then((response) => {
                if (!current) return
                const next = directory.parse(response)
                const lastPage = Math.max(1, Math.ceil(next.total / pageSize))
                if (page > lastPage) setPage(lastPage)
                else setData(next)
            })
            .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : t.failed) })
            .finally(() => { if (current) setLoading(false) })
        return () => { current = false }
    }, [query, type, tab, page, revision, t])

    async function open(project: Project, viewKey: string) {
        if (opening) return
        setOpening(project.id)
        setNavigationError('')
        try {
            const response = commandResult.parse(await request('invokeClientCommand', {
                commandKey: 'workbench.navigation.open',
                payload: { target: WORKBENCH_ASSISTANT_PROJECT_TARGET, projectId: project.id, viewKey }
            }))
            if (!response.success) throw Error(response.message || t.openFailed)
        } catch (reason) {
            setNavigationError(reason instanceof Error ? reason.message : t.openFailed)
        } finally { setOpening(undefined) }
    }

    const refresh = () => setRevision((value) => value + 1)
    const types = data?.summary.types ?? []
    const today = new Date(), yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })
    const fullDate = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    function updatedAt(iso: string) {
        const date = new Date(iso)
        if (date.toDateString() === today.toDateString()) return t.today + ' ' + time.format(date)
        if (date.toDateString() === yesterday.toDateString()) return t.yesterday + ' ' + time.format(date)
        return fullDate.format(date)
    }
    const options = type && !types.some((item) => typeKey(item) === typeKey(type)) ? [...types, { ...type, title: undefined }] : types
    const column = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground'
    return <main className="flex h-full min-w-0 flex-col bg-background text-foreground">
        <header className="shrink-0 border-b bg-muted/20">
            <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-5 sm:px-7">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border bg-background"><Folder aria-hidden="true" className="size-6" /></span>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.title}</h1>
                    {data && <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><UserRound className="size-3.5" />{data.summary.assistantName}</p>}
                </div>
                <Button variant="ghost" size="sm" disabled={loading} onClick={refresh} aria-label={t.refresh}><RefreshCw /><span className="hidden sm:inline">{t.refresh}</span></Button>
            </div>
        </header>
        <Tabs value={tab} onValueChange={(value) => { setTab(value); setType(null); setPage(1) }} className="min-h-0 flex-1 gap-0">
            <div className="shrink-0 border-b">
                <TabsHeader className="mx-auto max-w-6xl border-0 px-4 sm:px-7">
                    <TabsList variant="line" aria-label={t.title}>
                        <TabsTrigger value="all">{t.all}</TabsTrigger><TabsTrigger value="manageable">{t.manageable}</TabsTrigger>
                    </TabsList>
                </TabsHeader>
            </div>
            <TabsContent key={tab} value={tab} className="min-h-0 overflow-auto">
                <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="relative min-w-40 flex-1 sm:max-w-md">
                            <Search aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
                            <Input type="search" value={search} aria-label={t.search} placeholder={t.search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
                        </div>
                        <Select value={type ? typeKey(type) : 'all'} onValueChange={(key) => { setType(options.find((option) => typeKey(option) === key) ?? null); setPage(1) }}>
                            <SelectTrigger aria-label={t.type} className="max-w-full sm:min-w-36"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="all">{t.types}</SelectItem>
                                {options.map((item) => <SelectItem key={typeKey(item)} value={typeKey(item)}>{typeLabel(item, item.title, locale)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    {navigationError && <p role="alert" className="text-sm text-destructive">{navigationError}</p>}
                    {error ? <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{error}<Button variant="outline" size="sm" onClick={refresh}>{t.retry}</Button></div> :
                        loading ? <p role="status" className="py-4 text-sm text-muted-foreground">{t.loading}</p> :
                        !data?.items.length ? <p role="status" className="py-8 text-center text-sm text-muted-foreground">{query || type ? t.noMatch : tab === 'manageable' ? t.emptyManage : t.empty}</p> :
                        <div className="overflow-x-auto"><table className="w-full text-sm">
                            <thead className="bg-muted/50"><tr>
                                <th className={column}>{t.name}</th><th className={column + ' hidden md:table-cell'}>{t.type}</th>
                                <th className={column}>{t.role}</th><th aria-sort="descending" className={column + ' hidden lg:table-cell'}>{t.updated} <ArrowDown className="inline size-3" /></th>
                                <th className={column + ' text-right'}>{t.actions}</th>
                            </tr></thead>
                            <tbody>{data.items.map((row) => <tr key={row.id} className="border-b">
                                <th scope="row" className="px-3 py-4 text-left font-normal">
                                    <div className="flex items-start gap-3"><Folder aria-hidden="true" className="mt-0.5 hidden size-4 shrink-0 sm:block" />
                                        <div className="min-w-0 break-words"><span className="font-semibold">{row.name}</span>
                                            {row.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.description}</p>}
                                            <span className="text-xs text-muted-foreground md:hidden">{typeLabel(row, row.typeTitle, locale)}</span>
                                        </div>
                                    </div>
                                </th>
                                <td className="hidden px-3 md:table-cell">{typeLabel(row, row.typeTitle, locale)}</td>
                                <td className="px-3"><Badge variant="secondary" className="whitespace-nowrap">{t[row.myRole]}</Badge></td>
                                <td className="hidden whitespace-nowrap px-3 text-muted-foreground lg:table-cell"><time dateTime={row.updatedAt}>{updatedAt(row.updatedAt)}</time></td>
                                <td className="px-3"><div className="flex flex-wrap justify-end gap-1.5">
                                    {row.canEdit && <Button size="sm" variant="outline" disabled={!!opening} onClick={() => open(row, PROJECT_CONFIGURATION_VIEW)}>{t.configure}</Button>}
                                    {row.archived ? <span className="text-xs text-muted-foreground">{t.archived}</span> :
                                        <Button size="sm" variant="outline" disabled={!!opening} onClick={() => open(row, tasksView)}>{t.open}<ArrowUpRight aria-hidden="true" /></Button>}
                                </div></td>
                            </tr>)}</tbody>
                        </table></div>}
                    {!loading && !error && data && data.total > pageSize && <nav aria-label={t.title} className="flex items-center justify-end gap-3 text-sm">
                        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>{t.prev}</Button>
                        <span>{page} / {Math.ceil(data.total / pageSize)}</span>
                        <Button size="sm" variant="outline" disabled={page * pageSize >= data.total} onClick={() => setPage(page + 1)}>{t.next}</Button>
                    </nav>}
                </div>
            </TabsContent>
        </Tabs>
    </main>
}

function App() {
    const [scope, setScope] = useState(0)
    const [locale, setLocale] = useState('en-US')
    useEffect(() => {
        const changeScope = () => setScope((value) => value + 1)
        return connect((language, changed) => { setLocale(language); if (changed) changeScope() }, changeScope)
    }, [])
    return scope ? <Directory key={scope} locale={locale} /> : null
}

createRoot(document.getElementById('root')!).render(<App />)
