import { useViewVisible } from '../view-visibility'
import { useEffect, useState } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import {
    parseProjectPipelineParameters,
    type ProjectPipelineProviderActions,
    type ProjectPipelineProviderActionDescriptor,
    type ProjectPipelineProviderActionCommand
} from '@xpert-ai/contracts'
import { dateTime } from '../i18n'
import { ParameterField } from './configuration'
import { readProviderActions, submitProviderAction, type PipelineGraph, type PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function ProviderActions({
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
    const [data, setData] = useState<ProjectPipelineProviderActions | null>(null)
    const [form, setForm] = useState<{
        descriptor: ProjectPipelineProviderActionDescriptor
        input: ProjectPipelineProviderActionCommand
    } | null>(null)
    const [busy, setBusy] = useState(false),
        [message, setMessage] = useState('')
    const [loadError, setLoadError] = useState(false),
        [submittedId, setSubmittedId] = useState<string | null>(null)
    const label = (value: { en_US: string; zh_Hans?: string }) =>
        locale.startsWith('zh') ? (value.zh_Hans ?? value.en_US) : value.en_US
    useEffect(() => {
        if (!visible) return
        let alive = true
        const load = () =>
            readProviderActions(graph.instance.id, node.id)
                .then((value) => {
                    if (alive) {
                        setData(value)
                        setLoadError(false)
                    }
                })
                .catch(() => {
                    if (alive) setLoadError(true)
                })
        void load()
        const timer = window.setInterval(() => {
            if (!document.hidden) void load()
        }, 5000)
        return () => {
            alive = false
            window.clearInterval(timer)
        }
    }, [graph.instance.id, node.id, t.actionFailed, visible])
    const dispatchPaused = graph.dispatchEnabled === false || data?.dispatchEnabled === false
    const pending = !!data?.operations.some((operation) =>
        ['queued', 'dispatching', 'pending', 'unknown'].includes(operation.state)
    )
    const submitted = data?.operations.find((operation) => operation.id === submittedId)
    const awaitingDispatch = submitted && ['queued', 'dispatching'].includes(submitted.state)
    const stale =
        form &&
        (form.input.expectedRevision !== graph.instance.revision ||
            form.input.roundId !== graph.roundId ||
            !data?.items.some(
                (item) => item.ref === form.input.actionRef && item.sourceRevision === form.input.sourceRevision
            ))
    const select = (descriptor: ProjectPipelineProviderActionDescriptor) => {
        if (!data) return
        setMessage('')
        setForm({
            descriptor,
            input: {
                ...data.target,
                requestId: crypto.randomUUID(),
                actionRef: descriptor.ref,
                sourceRevision: descriptor.sourceRevision,
                parameters: { ...descriptor.defaults }
            }
        })
    }
    const submit = async () => {
        if (!form || stale || busy || pending || dispatchPaused) return
        setBusy(true)
        setMessage('')
        try {
            parseProjectPipelineParameters(form.descriptor.parameters, form.input.parameters)
            const receipt = await submitProviderAction(form.input)
            setForm(null)
            setSubmittedId(receipt.id)
            setData(
                (previous) =>
                    previous && {
                        ...previous,
                        operations: [
                            receipt,
                            ...previous.operations.filter((operation) => operation.id !== receipt.id)
                        ].slice(0, 50)
                    }
            )
            try {
                setData(await readProviderActions(graph.instance.id, node.id))
                await reload()
                setLoadError(false)
            } catch {
                setLoadError(true)
            } // A refresh failure does not undo the accepted intent.
        } catch {
            setMessage(t.actionFailed)
        } finally {
            setBusy(false)
        }
    }
    return (
        <section className="space-y-3 border-t pt-4" aria-label={t.providerActions}>
            <h3 className="text-sm font-medium">{t.providerActions}</h3>
            {!data && !message && !loadError && (
                <p role="status" className="text-xs text-muted-foreground">
                    {t.loading}
                </p>
            )}
            {!graph.permissions.canEdit && (
                <p role="status" className="text-xs text-muted-foreground">
                    {t.projectReadOnly}
                </p>
            )}
            {pending && (
                <p role="status" className="text-xs text-muted-foreground">
                    {t.operationPending}
                </p>
            )}
            {dispatchPaused && (
                <p role="status" className="text-xs text-muted-foreground">
                    {t.dispatchPaused}
                </p>
            )}
            {data && !dispatchPaused && !data.items.length && (
                <p className="text-xs text-muted-foreground">{t.providerActionsUnavailable}</p>
            )}
            <div className="flex flex-wrap gap-2">
                {data?.items.map((action) => (
                    <Button
                        key={action.ref}
                        variant="outline"
                        size="sm"
                        disabled={busy || pending || dispatchPaused || !graph.permissions.canEdit}
                        onClick={() => select(action)}
                    >
                        {label(action.label)}
                    </Button>
                ))}
            </div>
            {form && (
                <div className="space-y-3 rounded-lg border p-3">
                    <h4 className="text-sm font-medium">{label(form.descriptor.label)}</h4>
                    {form.descriptor.description && (
                        <p className="text-xs text-muted-foreground">{label(form.descriptor.description)}</p>
                    )}
                    {form.descriptor.effects === 'external_write' && (
                        <p className="text-xs">{t.providerActionExternal}</p>
                    )}
                    {form.descriptor.parameters.map((field) => (
                        <ParameterField
                            key={`${form.input.requestId}:${field.key}`}
                            field={field}
                            value={form.input.parameters[field.key]}
                            locale={locale}
                            disabled={busy || !!stale || pending}
                            onChange={(value) =>
                                setForm(
                                    (previous) =>
                                        previous && {
                                            ...previous,
                                            input: {
                                                ...previous.input,
                                                parameters: { ...previous.input.parameters, [field.key]: value }
                                            }
                                        }
                                )
                            }
                        />
                    ))}
                    {stale && (
                        <p role="status" className="text-xs text-destructive">
                            {t.providerActionStale}
                        </p>
                    )}
                    <Button
                        size="sm"
                        disabled={busy || !!stale || pending || dispatchPaused || !graph.permissions.canEdit}
                        onClick={() => void submit()}
                    >
                        {t.providerActionSubmit}
                    </Button>
                </div>
            )}
            {message && (
                <p role="status" className="text-xs text-muted-foreground">
                    {message}
                </p>
            )}
            {awaitingDispatch && (
                <p role="status" className="text-xs text-muted-foreground">
                    {t.providerActionAccepted}
                </p>
            )}
            {loadError && (
                <p role="status" className="text-xs text-muted-foreground">
                    {t.providerActionReadFailed}
                </p>
            )}
            <ul className="space-y-2 text-xs text-muted-foreground">
                {data?.operations.map((operation) => (
                    <li key={operation.id}>
                        {dateTime(operation.createdAt, locale)} ·{' '}
                        {operation.state === 'dispatching'
                            ? t.providerDispatching
                            : operation.state === 'succeeded'
                              ? t.providerActionConfirmed
                              : t[operation.state]}
                        {operation.projectionPending && ` · ${t.providerProjectionPending}`}
                        {operation.state === 'unknown' && <p>{t.providerActionUnknown}</p>}
                    </li>
                ))}
            </ul>
        </section>
    )
}
