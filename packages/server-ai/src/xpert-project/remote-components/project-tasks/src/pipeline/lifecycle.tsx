import { useRef, useState } from 'react'
import {
    Button,
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription
} from '@xpert-ai/shadcn-ui'
import { changePipelineLifecycle, type PipelineGraph } from './bridge'
import type { PipelineTexts } from './i18n'

export function PipelineLifecycle({
    graph,
    nodeId,
    t,
    reload
}: {
    graph: PipelineGraph
    nodeId?: string
    t: PipelineTexts
    reload: () => Promise<void>
}) {
    const [open, setOpen] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(false)
    const request = useRef<{ key: string; id: string } | null>(null)
    const operation = nodeId ? graph.actions.retries.find((item) => item.nodeInstanceId === nodeId) : undefined
    if (!graph.permissions.canEdit || (nodeId ? !operation : !graph.actions.cancel)) return null
    const title = nodeId ? t.retryNode : t.cancelRun
    const submit = async () => {
        const key = `${graph.instance.id}:${graph.instance.revision}:${operation?.operationId ?? 'cancel'}`
        if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() }
        setBusy(true)
        setError(false)
        try {
            await changePipelineLifecycle(graph, request.current.id, operation?.operationId)
            setOpen(false)
            await reload()
        } catch {
            setError(true)
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!busy) setOpen(value)
            }}
        >
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                    {title}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{nodeId ? t.retryHint : t.cancelHint}</DialogDescription>
                </DialogHeader>
                {error && (
                    <p role="alert" className="text-sm text-destructive">
                        {t.actionFailed}
                    </p>
                )}
                <DialogFooter>
                    <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                        {t.keepRunning}
                    </Button>
                    <Button variant={nodeId ? 'default' : 'destructive'} disabled={busy} onClick={() => void submit()}>
                        {title}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
