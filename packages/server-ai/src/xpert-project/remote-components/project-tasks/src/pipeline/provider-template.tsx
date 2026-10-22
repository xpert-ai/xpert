import { useState } from 'react'
import { Info, X } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogTitle, DialogDescription } from '@xpert-ai/shadcn-ui'
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
        <>
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
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent
                    className="flex max-h-[85dvh] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
                    showCloseButton={false}
                >
                    <div className="flex shrink-0 items-start justify-between gap-4 border-b p-4">
                        <div className="min-w-0 space-y-1">
                            <DialogTitle>{t.templateInfo}</DialogTitle>
                            <DialogDescription>{t.providerDescription}</DialogDescription>
                        </div>
                        <Button variant="ghost" size="icon" aria-label={t.close} onClick={() => setOpen(false)}>
                            <X />
                        </Button>
                    </div>
                    <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
                        <div className="min-w-0 space-y-4 p-4">
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
                    <div className="flex shrink-0 justify-end border-t bg-muted/30 p-4">
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            {t.close}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
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
