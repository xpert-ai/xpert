import { useEffect, useRef, useState } from 'react'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Button } from '@xpert-ai/shadcn-ui'
import { ExecutionPageCache } from './execution-data'
import { request, type Graph } from './bridge'
import { z } from 'zod'
import { RuntimeDetail } from './runtime-detail'
import { executionSummary } from './execution-summary'
import { texts } from './i18n'
import { useViewVisible } from './view-visibility'
import { openTaskExecution } from './execution-navigation'

export function TaskExecutionHistory({
    taskId,
    executionVersion,
    locale,
    section,
    canEdit
}: {
    taskId: string
    executionVersion?: string
    locale: string
    section: 'history' | 'outputs'
    canEdit: boolean
}) {
    const cache = useRef(new ExecutionPageCache())
    const visible = useViewVisible(),
        t = texts(locale)
    const [after, setAfter] = useState<string | undefined>(),
        [previous, setPrevious] = useState<Array<string | undefined>>([])
    const [page, setPage] = useState<{ items: Graph['executions']; next: string | null } | null>(null)
    const [selected, setSelected] = useState(''),
        [error, setError] = useState('')
    useEffect(() => {
        if (!visible) return
        let active = true,
            loading = false
        const load = async () => {
            if (loading) return
            loading = true
            try {
                const result = await cache.current.read([taskId], after)
                if (active) {
                    setPage(result)
                    setError('')
                }
            } catch (error) {
                if (active) setError(error instanceof Error ? error.message : String(error))
            } finally {
                loading = false
            }
        }
        void load()
        return () => {
            active = false
        }
    }, [taskId, after, visible, executionVersion])
    const navigate = (cursor?: string) => {
        setAfter(cursor)
        setPage(null)
        setSelected('')
    }
    return (
        <div className="space-y-3">
            {error && <p role="alert">{error}</p>}
            {!page && !error && <p role="status">{t.loading}</p>}
            {page?.items.length === 0 && <p>{t.noExecutions}</p>}
            <Accordion type="single" collapsible value={selected} onValueChange={setSelected}>
                {page?.items.map((attempt) => (
                    <AccordionItem key={attempt.id} value={attempt.id}>
                        <AccordionTrigger>
                            #{attempt.attempt} · {executionSummary(attempt, t).label}
                        </AccordionTrigger>
                        <AccordionContent>
                            {selected === attempt.id &&
                                (attempt.invocationId ? (
                                    <RuntimeDetail
                                        taskId={taskId}
                                        executionId={attempt.id}
                                        locale={locale}
                                        section={section}
                                        canEdit={canEdit}
                                        openAttempt={(id) => {
                                            void openTaskExecution(id, t.openFailed).catch((error: unknown) =>
                                                setError(String(error))
                                            )
                                        }}
                                        openConversation={(id) => {
                                            void openTaskExecution(id, t.openFailed, 'conversation').catch(
                                                (error: unknown) => setError(String(error))
                                            )
                                        }}
                                    />
                                ) : (
                                    <div>
                                        <LegacyExecutionDetail taskId={taskId} executionId={attempt.id} />
                                        <Button
                                            disabled={!attempt.agentExecutionId}
                                            onClick={() => {
                                                void openTaskExecution(attempt.id, t.openFailed).catch(
                                                    (error: unknown) => setError(String(error))
                                                )
                                            }}
                                        >
                                            {t.open}
                                        </Button>
                                    </div>
                                ))}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
            <div className="flex gap-2">
                {!!previous.length && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            navigate(previous[previous.length - 1])
                            setPrevious((items) => items.slice(0, -1))
                        }}
                    >
                        {locale.startsWith('zh') ? '上一页' : 'Previous'}
                    </Button>
                )}
                {page?.next && (
                    <Button
                        variant="outline"
                        onClick={() => {
                            setPrevious((items) => [...items, after])
                            navigate(page.next ?? undefined)
                        }}
                    >
                        {locale.startsWith('zh') ? '下一页' : 'Next'}
                    </Button>
                )}
            </div>
        </div>
    )
}

function LegacyExecutionDetail({ taskId, executionId }: { taskId: string; executionId: string }) {
    const visible = useViewVisible()
    const [detail, setDetail] = useState<{ outputSummary?: string | null; error?: string | null } | null>(null)
    const [error, setError] = useState('')
    useEffect(() => {
        if (!visible) return
        let active = true
        void request('requestData', {
            query: { parameters: { contractVersion: 2, resource: 'execution-detail', taskId, executionId } }
        })
            .then((value) => {
                const data = z
                    .object({
                        item: z.object({
                            executions: z.array(
                                z.object({ outputSummary: z.string().nullish(), error: z.string().nullish() })
                            )
                        })
                    })
                    .parse(value)
                if (active) setDetail(data.item.executions[0] ?? null)
            })
            .catch((error: unknown) => {
                if (active) setError(error instanceof Error ? error.message : String(error))
            })
        return () => {
            active = false
        }
    }, [taskId, executionId, visible])
    return (
        <div className="space-y-2 whitespace-pre-wrap break-words">
            {error && <p role="alert">{error}</p>}
            {detail?.outputSummary && <p>{detail.outputSummary}</p>}
            {detail?.error && <p>{detail.error}</p>}
        </div>
    )
}
