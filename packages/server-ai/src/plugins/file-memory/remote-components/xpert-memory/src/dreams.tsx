import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Moon, Settings2 } from 'lucide-react'
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@xpert-ai/shadcn-ui'
import { DreamSettings } from './dream-settings'
import { mutate, runs, report, useQuery } from './data'
import { Notice, Pager, Status, useLabel, useText } from './shared'

export function Dreams({ refresh }: { refresh: number }) {
    const t = useText(),
        label = useLabel(),
        [tick, setTick] = useState(0),
        [page, setPage] = useState(1),
        [id, select] = useState(''),
        [config, showConfig] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('')
    const q = useQuery(runs, 'runs', refresh + tick, { page }),
        active = q.data?.rows.some((r) => ['running', 'queued'].includes(r.status))
    useEffect(() => {
        if (active) {
            const timer = setTimeout(() => setTick((n) => n + 1), 4500)
            return () => clearTimeout(timer)
        }
    }, [active, tick])
    async function action(key: string, input: object) {
        setBusy(true)
        setError('')
        try {
            await mutate(key, input)
            setTick((n) => n + 1)
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    if (config)
        return (
            <DreamSettings
                refresh={refresh}
                close={(saved) => {
                    showConfig(false)
                    if (saved) setTick((n) => n + 1)
                }}
            />
        )
    return (
        <div className="space-y-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{t('整理记录', 'Dream history')}</h2>
                {q.data?.canManage && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" onClick={() => showConfig(true)}>
                            <Settings2 />
                            {t('设置', 'Settings')}
                        </Button>
                        <Button disabled={busy} onClick={() => void action('dream', {})}>
                            <Moon />
                            {t('运行 Dream', 'Run Dream')}
                        </Button>
                    </div>
                )}
            </div>
            {error && <Notice error={error} />}{' '}
            {!q.data ? (
                <Notice error={q.error} />
            ) : (
                <>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('运行时间', 'Run time')}</TableHead>
                                <TableHead>{t('触发方式', 'Trigger')}</TableHead>
                                <TableHead>{t('结果', 'Result')}</TableHead>
                                <TableHead>{t('变更', 'Changes')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {q.data.rows.map((r) => {
                                const expanded = id === r.runId
                                const toggle = () => select(expanded ? '' : r.runId)
                                return (
                                    <Fragment key={r.runId}>
                                        <TableRow className="cursor-pointer" onClick={toggle}>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    aria-expanded={expanded}
                                                    aria-controls={expanded ? 'dream-report' : undefined}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        toggle()
                                                    }}
                                                >
                                                    {expanded ? <ChevronDown /> : <ChevronRight />}
                                                    {new Date(r.requestedAt).toLocaleString()}
                                                </Button>
                                            </TableCell>
                                            <TableCell>{label(r.reason)}</TableCell>
                                            <TableCell>
                                                <Status value={r.status} />
                                            </TableCell>
                                            <TableCell>{r.changedFileCount ?? '—'}</TableCell>
                                        </TableRow>
                                        {expanded && (
                                            <TableRow>
                                                <TableCell
                                                    id="dream-report"
                                                    colSpan={4}
                                                    className="space-y-2 whitespace-normal wrap-anywhere"
                                                >
                                                    <Report id={id} refresh={refresh + tick} />
                                                    {r.status === 'queued' && q.data?.canManage && (
                                                        <Button
                                                            variant="outline"
                                                            disabled={busy}
                                                            onClick={() => void action('cancel', { runId: id })}
                                                        >
                                                            {t('取消排队', 'Cancel queued run')}
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </Fragment>
                                )
                            })}
                        </TableBody>
                    </Table>
                    {!q.data.rows.length && <Notice>{t('还没有 Dream 整理记录。', 'No Dream runs yet.')}</Notice>}
                    <Pager {...q.data} set={setPage} />
                </>
            )}
        </div>
    )
}
function Report({ id, refresh }: { id: string; refresh: number }) {
    const t = useText(),
        label = useLabel(),
        q = useQuery(report, 'run', refresh, { id })
    if (!q.data) return <Notice error={q.error} />
    const r = q.data.report
    return (
        <>
            {q.data.run.reasons.map((reason, i) => (
                <p key={i}>{reason}</p>
            ))}
            {r ? (
                <>
                    {r.model && (
                        <p className="text-muted-foreground">
                            {t('整理模型', 'Model')} · {r.model}
                        </p>
                    )}
                    <h3 className="font-semibold">{t('变更明细', 'Changes')}</h3>
                    {r.changedFiles.map((f, i) => (
                        <p key={i}>
                            <b>{label(f.changeType)}</b> · {f.path}
                            <br />
                            {f.reason}
                            {f.before && (
                                <span className="block">
                                    {t('整理前', 'Before')} · {f.before.content}
                                </span>
                            )}
                            {f.after && (
                                <span className="block">
                                    {t('整理后', 'After')} · {f.after.content}
                                </span>
                            )}
                            {f.quote && (
                                <span className="block">
                                    {t('原文引文', 'Source quote')} · {f.quote}
                                </span>
                            )}
                        </p>
                    ))}
                    {r.unresolvedConflicts.map((c, i) => (
                        <p key={i}>
                            {t('待确认', 'Needs confirmation')} · {c.reason}
                        </p>
                    ))}
                    <p className="leading-relaxed whitespace-pre-wrap wrap-anywhere">{r.dreamDiary}</p>
                </>
            ) : (
                <p className="text-muted-foreground">
                    {q.data.run.status === 'failed'
                        ? t(
                              '整理运行失败，未生成报告。请检查主智能体的模型配置和运行日志。',
                              'The run failed before producing a report. Check the primary agent model and run logs.'
                          )
                        : t('此运行尚无整理报告。', 'No report is available for this run.')}
                </p>
            )}
        </>
    )
}
