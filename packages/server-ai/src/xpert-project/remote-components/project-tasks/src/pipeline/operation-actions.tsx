import { useEffect, useId, useState } from 'react'
import { Button, Checkbox } from '@xpert-ai/shadcn-ui'
import type { ProjectPipelineOperationActions } from '@xpert-ai/contracts'
import { useViewVisible } from '../view-visibility'
import { readOperationActions, submitOperationAction, type PipelineGraph, type PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function OperationActions({
    graph,
    node,
    locale,
    t,
    reload
}: {
    graph: PipelineGraph
    node: PipelineNode
    locale: string
    t: PipelineTexts
    reload: () => Promise<void>
}) {
    const visible = useViewVisible()
    const confirmationId = useId()
    const [data, setData] = useState<ProjectPipelineOperationActions | null>(null)
    const [confirmed, setConfirmed] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(false)
    const label = (value: { en_US: string; zh_Hans?: string }) =>
        locale.startsWith('zh') ? (value.zh_Hans ?? value.en_US) : value.en_US
    useEffect(() => {
        if (!visible) return
        let alive = true
        const load = () =>
            readOperationActions(graph.instance.id, node.id)
                .then((value) => {
                    if (alive) {
                        setData(value)
                        setError(false)
                    }
                })
                .catch(() => {
                    if (alive) setError(true)
                })
        void load()
        const timer = window.setInterval(() => {
            if (!document.hidden) void load()
        }, 5000)
        return () => {
            alive = false
            window.clearInterval(timer)
        }
    }, [graph.instance.id, node.id, visible])
    if (!data?.messages.length && !error) return null
    return (
        <section className="space-y-3 border-t pt-4" aria-label={locale.startsWith('zh') ? '节点操作' : 'Node actions'}>
            {data?.messages.map((message, i) => (
                <p className="break-all text-sm" key={i}>
                    {label(message)}
                </p>
            ))}
            {data?.items.map((item) => {
                const key = `${data.operationId}:${item.key}:${item.version}`
                const checkboxId = `${confirmationId}-${key}`
                return (
                    <div key={key} className="space-y-3 rounded-lg border p-3">
                        <label htmlFor={checkboxId} className="flex items-start gap-2 text-sm">
                            <Checkbox
                                id={checkboxId}
                                className="mt-0.5"
                                checked={confirmed === key}
                                disabled={busy}
                                onCheckedChange={(checked) => setConfirmed(checked === true ? key : '')}
                            />
                            {label(item.confirmation)}
                        </label>
                        <Button
                            disabled={busy || confirmed !== key || graph.dispatchEnabled === false}
                            onClick={async () => {
                                if (!data.operationId || busy) return
                                setBusy(true)
                                setError(false)
                                try {
                                    await submitOperationAction({
                                        operationId: data.operationId,
                                        key: item.key,
                                        version: item.version
                                    })
                                    setConfirmed('')
                                    setData(await readOperationActions(graph.instance.id, node.id))
                                    await reload()
                                } catch {
                                    setError(true)
                                } finally {
                                    setBusy(false)
                                }
                            }}
                        >
                            {label(item.title)}
                        </Button>
                    </div>
                )
            })}
            {error && (
                <p role="alert" className="text-sm text-destructive">
                    {t.actionFailed}
                </p>
            )}
        </section>
    )
}
