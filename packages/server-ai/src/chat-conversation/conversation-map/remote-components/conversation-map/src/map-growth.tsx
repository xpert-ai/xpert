import React, { useMemo, useRef } from 'react'
import type { MapEdge, MapNode } from '../../../schema'
import { mapTrail } from './map-model'
import { TrailTree } from './trail-tree'
import { trailLabels } from './trail-i18n'
import { labels } from './i18n'
import { messageCaption } from './node-details'

/** The same growth canvas accepts the map projection when private execution inspection is unavailable. */
export function MapGrowth({
    nodes,
    edges,
    title,
    locale,
    selected,
    select
}: {
    nodes: MapNode[]
    edges: MapEdge[]
    title: string
    locale: string
    selected?: string
    select: (node: MapNode) => void
}) {
    const panelRef = useRef<HTMLElement>(null)
    const l = labels(locale)
    const graph = useMemo(
        () =>
            mapTrail(
                nodes.map((node) =>
                    node.message
                        ? { ...node, title: `${node.title} · ${messageCaption(node, l)} · #${node.message.sequence}` }
                        : node
                ),
                edges,
                title
            ),
        [nodes, edges, title, l]
    )
    return (
        <TrailTree
            graph={graph}
            showStatus={false}
            collapsed={new Set()}
            selected={selected}
            panelRef={panelRef}
            panelOpen={false}
            labels={{
                ...trailLabels(locale),
                discussionLegend: `${l.publicDiscussion} · ${l.conversationRelations} · ${l.message}`,
                legendSelectedPath: l.publicDiscussion,
                legendFork: l.conversationRelations,
                legendTurn: l.message
            }}
            select={(step) => {
                const node = nodes.find((node) => node.id === step.id)
                if (node) select(node)
            }}
        />
    )
}
