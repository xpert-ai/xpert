import { ConfigurationEditor } from './editors/editor'
import { projectConfigurationOverviewSchema } from './model'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Badge, Textarea } from '@xpert-ai/shadcn-ui'
import { RefreshCw, Settings2 } from 'lucide-react'
import { z } from 'zod'
import {
    type ProjectConfigurationOverview,
    type ProjectConfigurationSection
} from '@xpert-ai/contracts'
import { connect, request } from './bridge'
import { configurationI18n } from './i18n'

const response = z.object({ item: projectConfigurationOverviewSchema })
const actionResponse = z.object({ success: z.boolean(), message: z.string().optional() })

function App() {
    const [locale, setLocale] = useState('en-US')
    const [data, setData] = useState<ProjectConfigurationOverview | null>(null)
    const [instruction, setInstruction] = useState('')
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [saved, setSaved] = useState(false)
    const [editor, setEditor] = useState<ProjectConfigurationSection | null>(null)
    const [deleted, setDeleted] = useState(false)
    const generation = useRef(0)
    const t = configurationI18n(locale)
    const dirty = !!data && instruction !== data.instruction

    async function load(reset = false) {
        const version = ++generation.current
        setLoading(true)
        setError('')
        setSaved(false)
        if (reset) {
            setDeleted(false)
            setEditor(null)
            setData(null)
            setInstruction('')
            setBusy(false)
        }
        try {
            const { item } = response.parse(await request('requestData'))
            if (version !== generation.current) return
            setData(item)
            setInstruction(item.instruction)
        } catch (error) {
            if (version === generation.current) setError(error instanceof Error ? error.message : t.t('failed'))
        } finally {
            if (version === generation.current) setLoading(false)
        }
    }

    useEffect(() => {
        const dispose = connect(
            (language, changed) => {
                setLocale(language)
                if (changed) void load(true)
            },
            () => {
                void load(true)
            }
        )
        return () => {
            generation.current++
            dispose()
        }
    }, [])

    function edit(section: ProjectConfigurationSection) {
        if (!busy && !dirty) setEditor(section)
    }

    async function save() {
        if (!data?.canEdit || busy || !dirty) return
        const version = generation.current
        const content = instruction
        setBusy(true)
        setError('')
        setSaved(false)
        try {
            const result = actionResponse.parse(
                await request('executeAction', { actionKey: 'instructions', input: { content } })
            )
            if (version !== generation.current) return
            if (!result.success) throw Error(result.message || t.t('failed'))
            setData((current) => (current ? { ...current, instruction: content } : null))
            setSaved(true)
        } catch (error) {
            if (version === generation.current) setError(error instanceof Error ? error.message : t.t('failed'))
        } finally {
            if (version === generation.current) setBusy(false)
        }
    }
    function section(key: ProjectConfigurationSection, children: ReactNode, editable = data?.canManage) {
        return (
            <section className="space-y-4" aria-labelledby={`heading-${key}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <h2 id={`heading-${key}`} className="text-base font-semibold">
                        {t.t(key)}
                    </h2>
                    <Button variant="outline" disabled={busy || dirty || loading} onClick={() => void edit(key)}>
                        {t.t(editable ? 'manage' : 'inspect')}
                    </Button>
                </div>
                {children}
            </section>
        )
    }
    const empty = <p className="text-sm text-muted-foreground">{t.t('empty')}</p>
    if (deleted) return <main className="p-6 text-foreground" role="status">{t.t('deleted')}</main>
    return (
        <main className="h-full overflow-auto bg-background text-foreground">
            {data && editor && <ConfigurationEditor key={`${data.projectId}:${editor}`} section={editor} overview={data} locale={locale}
                onClose={() => { setEditor(null); void load() }} onDeleted={() => { setEditor(null); setDeleted(true) }} />}
            <div className="mx-auto flex max-w-5xl flex-col gap-7 p-4 sm:p-6">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
                    <div className="min-w-0">
                        <h1 className="flex items-center gap-2 text-xl font-semibold">
                            <Settings2 className="size-5" />
                            {t.t('title')}
                        </h1>
                        <p className="mt-1 break-words text-sm text-muted-foreground">{data?.name}</p>
                    </div>
                    <Button
                        variant="ghost"
                        disabled={loading || busy || dirty}
                        onClick={() => void load()}
                        aria-label={t.t('refresh')}
                    >
                        <RefreshCw className="size-4" />
                        {t.t('refresh')}
                    </Button>
                </header>
                {error && (
                    <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
                        <p className="break-words">{error}</p>
                        <Button variant="outline" disabled={busy || dirty} onClick={() => void load()}>
                            {t.t('retry')}
                        </Button>
                    </div>
                )}
                {loading && (
                    <p role="status" className="text-sm text-muted-foreground">
                        {t.t('loading')}
                    </p>
                )}
                {data && (
                    <>
                        {!data.canEdit && (
                            <Badge variant="secondary" className="self-start">
                                {t.t('readonly')}
                            </Badge>
                        )}
                        {section(
                            'type',
                            <p className="text-sm text-muted-foreground">
                                {t.t('duration', {
                                    hours: t.number(data.effectiveMaxDurationSeconds / 3600),
                                    ceiling: t.number(data.tenantMaxDurationSeconds / 3600)
                                })}
                            </p>
                        )}
                        {section(
                            'experts',
                            <div className="flex flex-wrap gap-2">
                                {data.experts.length
                                    ? data.experts.map((expert) => (
                                          <Badge key={expert.id} variant="outline">
                                              {expert.name}
                                          </Badge>
                                      ))
                                    : empty}
                            </div>
                        )}
                        {section(
                            'members',
                            <ul className="flex flex-wrap gap-3">
                                {data.members.length
                                    ? data.members.map((member) => (
                                          <li key={member.id} className="flex items-center gap-2 text-sm">
                                              <span>{member.name}</span>
                                              <span className="text-xs text-muted-foreground">{t.t(member.role)}</span>
                                          </li>
                                      ))
                                    : empty}
                            </ul>
                        )}
                        <section className="space-y-4" aria-labelledby="heading-instructions">
                            <h2 id="heading-instructions" className="border-b pb-3 text-base font-semibold">
                                {t.t('instructions')}
                            </h2>
                            <Textarea
                                aria-label={t.t('instructions')}
                                className="min-h-40"
                                value={instruction}
                                disabled={!data.canEdit || busy || loading}
                                onChange={(event) => {
                                    setInstruction(event.target.value)
                                    setSaved(false)
                                }}
                            />
                            {data.canEdit && (
                                <div className="flex flex-wrap items-center gap-3">
                                    <Button disabled={!dirty || busy || loading} onClick={() => void save()}>
                                        {t.t(busy ? 'saving' : 'save')}
                                    </Button>
                                    {saved && (
                                        <span role="status" className="text-sm text-muted-foreground">
                                            {t.t('saved')}
                                        </span>
                                    )}
                                    {dirty && <p className="text-xs text-muted-foreground">{t.t('dirty')}</p>}
                                </div>
                            )}
                        </section>
                        {section(
                            'skills',
                            <div className="grid gap-3 sm:grid-cols-2">
                                {data.skills.length
                                    ? data.skills.map((skill) => (
                                          <article key={skill.id} className="space-y-1 rounded-lg border p-3">
                                              <div className="flex flex-wrap items-center justify-between gap-2">
                                                  <h3 className="text-sm font-medium">{skill.name}</h3>
                                                  <Badge variant="secondary">
                                                      {t.t(skill.enabled ? 'enabled' : 'disabled')}
                                                  </Badge>
                                              </div>
                                              {skill.description && (
                                                  <p className="line-clamp-2 text-xs text-muted-foreground">
                                                      {skill.description}
                                                  </p>
                                              )}
                                          </article>
                                      ))
                                    : empty}
                            </div>,
                            data.canEdit
                        )}
                        {section('connectors', <p className="text-sm text-muted-foreground">{t.t('connectorHint')}</p>)}
                        {section(
                            'automations',
                            <div className="space-y-3">
                                <p className="text-xs text-muted-foreground">
                                    {t.t('automationCount', { count: t.number(data.automationTotal) })}
                                </p>
                                <ul className="divide-y">
                                    {data.automations.map((task) => (
                                        <li key={task.id} className="flex items-center justify-between gap-3 py-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium">{task.name}</p>
                                                <p className="text-xs text-muted-foreground">{task.schedule}</p>
                                            </div>
                                            <Badge variant="outline">
                                                {t.t(
                                                    task.status === 'scheduled' ||
                                                        task.status === 'paused' ||
                                                        task.status === 'archived'
                                                        ? task.status
                                                        : 'unknown'
                                                )}
                                            </Badge>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {data.isOwner &&
                            section(
                                'delete',
                                <p className="text-sm text-muted-foreground">
                                    {t.t(data.applicationManaged ? 'managed' : 'deleteHint')}
                                </p>
                            )}
                    </>
                )}
            </div>
        </main>
    )
}
createRoot(document.getElementById('root')!).render(<App />)
