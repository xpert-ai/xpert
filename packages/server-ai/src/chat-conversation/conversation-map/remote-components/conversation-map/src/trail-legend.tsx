import React, { useId, useState } from 'react'
import { ChevronDown, ChevronUp, Info } from 'lucide-react'
import { Button } from '@xpert-ai/shadcn-ui'
import type { TrailGraph } from '../../../../../../../contracts/src/ai/conversation-trail.model'
import { ActivityGlyph } from './trail-glyph'
import type { TrailLabels } from './trail-i18n'

type Structure = 'trunk' | 'limb' | 'episode' | 'leaf' | 'uncertain'

export function TrailLegend({ layer, labels: l }: { layer: TrailGraph['layer']; labels: TrailLabels }) {
    const [expanded, setExpanded] = useState(true)
    const contentId = useId()
    const structures: { kind: Structure; label: string }[] =
        layer === 'execution'
            ? [
                  { kind: 'trunk', label: l.legendTrunk },
                  { kind: 'limb', label: l.legendLimb },
                  { kind: 'episode', label: l.legendEpisode },
                  { kind: 'leaf', label: l.legendLeaf },
                  { kind: 'uncertain', label: l.legendMissingAnchor }
              ]
            : [
                  { kind: 'trunk', label: l.legendSelectedPath },
                  { kind: 'limb', label: l.legendFork },
                  { kind: 'leaf', label: l.legendTurn }
              ]
    return (
        <section
            aria-label={l.legend}
            data-testid="trail-legend"
            className="pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-lg border bg-card/95 text-card-foreground shadow-md backdrop-blur-sm"
        >
            <Button
                variant="ghost"
                size="sm"
                className="w-full shrink-0 justify-start rounded-none px-3"
                aria-expanded={expanded}
                aria-controls={contentId}
                onClick={() => setExpanded((old) => !old)}
            >
                <Info aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="flex-1 text-left">{l.legend}</span>
                {expanded ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
            </Button>
            <div
                id={contentId}
                hidden={!expanded}
                className="min-h-0 overflow-y-auto overscroll-contain border-t px-3 py-2"
            >
                <ul className="space-y-1">
                    {structures.map(({ kind, label }) => (
                        <li key={kind} className="flex min-h-6 items-center gap-2 text-xs">
                            <StructureGlyph kind={kind} />
                            <span>{label}</span>
                        </li>
                    ))}
                </ul>
                {layer === 'execution' && (
                    <>
                        <p className="mb-2 mt-3 border-t pt-2 text-[11px] font-medium text-muted-foreground">
                            {l.legendActivities}
                        </p>
                        <ul className="space-y-1">
                            {(['task', 'explore', 'change', 'verify', 'answer', 'other'] as const).map((activity) => (
                                <li key={activity} className="flex min-h-6 items-center gap-2 text-xs">
                                    <svg aria-hidden className="size-5 shrink-0" viewBox="-10 -10 20 20">
                                        <ActivityGlyph activity={activity} x={0} y={0} />
                                    </svg>
                                    <span>{l[activity]}</span>
                                </li>
                            ))}
                            <li className="flex min-h-6 items-center gap-2 text-xs">
                                <svg aria-hidden className="size-5 shrink-0 text-destructive" viewBox="-10 -10 20 20">
                                    <path d="M-4 -4L4 4M4 -4L-4 4" stroke="currentColor" strokeWidth={2} />
                                </svg>
                                <span>{l.legendFailed}</span>
                            </li>
                        </ul>
                    </>
                )}
                <div className="mt-3 space-y-1 border-t pt-2 text-[11px] leading-relaxed text-muted-foreground">
                    <p>{l.legendOrder}</p>
                    <p>{l.legendWidth}</p>
                </div>
            </div>
        </section>
    )
}

function StructureGlyph({ kind }: { kind: Structure }) {
    return (
        <svg
            aria-hidden
            className="size-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {kind === 'trunk' && <path d="M2 10Q12 10 22 12Q12 12 2 15Z" fill="currentColor" stroke="none" />}
            {kind === 'limb' && (
                <>
                    <path d="M3 19H21" strokeWidth={2} />
                    <path d="M6 19C11 19 9 5 21 5" strokeWidth={2.5} />
                </>
            )}
            {kind === 'episode' && (
                <>
                    <path d="M3 19H21" strokeWidth={2} />
                    <path d="M7 19Q10 7 20 5" strokeWidth={1} />
                </>
            )}
            {kind === 'leaf' && (
                <>
                    <path d="M7 21L13 11" strokeWidth={1} />
                    <path d="M12 14Q6 5 20 3Q21 13 12 14Z" fill="currentColor" stroke="none" />
                </>
            )}
            {kind === 'uncertain' && (
                <path d="M3 19C11 19 9 5 21 5" strokeWidth={2.5} strokeDasharray="3 3" strokeLinecap="butt" />
            )}
        </svg>
    )
}
