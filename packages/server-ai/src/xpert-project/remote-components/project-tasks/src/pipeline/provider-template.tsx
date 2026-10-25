import { useState } from 'react'
import { Info } from 'lucide-react'
import {
    Button,
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogClose,
    DialogTitle,
    DialogDescription
} from '@xpert-ai/shadcn-ui'
import type { PipelineGraph } from './bridge'
import { pipelineConfigurationTexts } from './configuration-i18n'
import { openProjectWorkspace } from './navigation'

export type CurrentPipeline = Pick<PipelineGraph, 'definition' | 'instance'>

export function ProviderTemplateDialog({
    pipeline,
    projectId,
    locale,
    initialOpen = false
}: {
    pipeline: CurrentPipeline
    projectId?: string
    locale: string
    initialOpen?: boolean
}) {
    const t = pipelineConfigurationTexts(locale)
    const [open, setOpen] = useState(initialOpen)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState(false)
    const openApplication = async () => {
        if (!projectId || busy) return
        setBusy(true)
        setError(false)
        try {
            await openProjectWorkspace(
                projectId,
                'application',
                t.openingApplicationFailed,
                undefined,
                pipeline.instance.id
            )
            setOpen(false)
        } catch {
            setError(true)
        } finally {
            setBusy(false)
        }
    }
    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setError(false)
                        setOpen(true)
                    }}
                >
                    <Info />
                    {t.templateInfo}
                </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85dvh] min-w-0 flex-col overflow-hidden sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t.templateInfo}</DialogTitle>
                    <DialogDescription>{t.providerDescription}</DialogDescription>
                </DialogHeader>
                <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                    <div className="min-w-0 space-y-4">
                        <ProviderTemplate
                            pipeline={pipeline}
                            locale={locale}
                            canOpen={!!projectId}
                            busy={busy}
                            onOpen={() => void openApplication()}
                        />
                        {error && (
                            <p role="alert" className="text-sm text-destructive">
                                {t.openingApplicationFailed}
                            </p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="outline">{t.close}</Button>
                    </DialogClose>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/** The persisted instance is authoritative even when a newer template is available in the catalog. */
export function ProviderTemplate({
    pipeline,
    locale,
    canOpen,
    busy,
    onOpen
}: {
    pipeline: CurrentPipeline
    locale: string
    canOpen: boolean
    busy: boolean
    onOpen: () => void
}) {
    const t = pipelineConfigurationTexts(locale)
    return (
        <section className="min-w-0 space-y-3" aria-label={t.currentBinding}>
            <h3 className="text-sm font-medium">{t.currentBinding}</h3>
            <dl className="grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t.template}</dt>
                <dd className="min-w-0 break-words">{pipeline.definition.title}</dd>
                <dt className="text-muted-foreground">{t.version}</dt>
                <dd>{pipeline.definition.version}</dd>
                <dt className="text-muted-foreground">{t.key}</dt>
                <dd className="min-w-0 break-all">{pipeline.definition.key}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">{t.providerBinding}</p>
            {canOpen && (
                <Button variant="outline" disabled={busy} onClick={onOpen}>
                    {t.openApplication}
                </Button>
            )}
        </section>
    )
}
