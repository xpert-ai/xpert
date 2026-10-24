import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@xpert-ai/shadcn-ui'
import { dateTime } from '../i18n'
import type { PipelineNode } from './bridge'
import type { PipelineTexts } from './i18n'

export function NodePresentation({ node, locale, t }: { node: PipelineNode; locale: string; t: PipelineTexts }) {
    const facts = node.projection.presentation
    if (!facts) return null
    return (
        <div className="space-y-3 text-sm">
            {facts.description && <p className="text-muted-foreground">{facts.description}</p>}
            {!!facts.blockers?.length && (
                <section aria-label={t.blocked}>
                    <h3 className="font-medium">{t.blocked}</h3>
                    <ul className="list-inside list-disc text-destructive">
                        {facts.blockers.map((reason, i) => (
                            <li key={i}>{reason}</li>
                        ))}
                    </ul>
                </section>
            )}
            {facts.decision && (
                <section className="space-y-1 rounded-lg border p-3" aria-label={t.routeDecision}>
                    <h3 className="font-medium">
                        {t.routeDecision} · {facts.decision.label}
                    </h3>
                    <p>{facts.decision.reason}</p>
                    <p className="text-xs text-muted-foreground">{dateTime(facts.decision.decidedAt, locale)}</p>
                    <Accordion type="single" collapsible>
                        <AccordionItem value="evidence">
                            <AccordionTrigger>{t.versionEvidence}</AccordionTrigger>
                            <AccordionContent>
                                <p className="break-all">{facts.decision.version}</p>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </section>
            )}
            {facts.operationUnavailableReason && (
                <p role="status" className="text-muted-foreground">
                    {facts.operationUnavailableReason}
                </p>
            )}
        </div>
    )
}
