import React from 'react'
import { MessagesSquare, Network, Search, List, Sprout, Loader2 } from 'lucide-react'
import { InputGroup, InputGroupAddon, InputGroupInput, TabsList, TabsTrigger } from '@xpert-ai/shadcn-ui'
import type { MapPage } from '../../../schema'
import { preferredMapMode, readOptions, type Prefs } from './bridge'
import type { Labels } from './i18n'
import { SearchSelect } from './search-select'
import type { OptionCache } from './option-cache'
import { ChoiceSelect, DisplaySettings, HistoryToggle } from './view-controls'

type Controls = { prefs: Prefs; update: (patch: Partial<Prefs>) => void; labels: Labels }

export function MapHeader({
    prefs,
    update,
    labels: l,
    page,
    search,
    setSearch,
    revision,
    headerRef,
    optionCache
}: Controls & {
    page: MapPage | null
    search: string
    setSearch: (value: string) => void
    revision: number
    headerRef: React.RefObject<HTMLElement>
    optionCache: OptionCache
}) {
    const projectId = prefs.projectId === undefined ? page?.projectId : prefs.projectId
    return (
        <header
            ref={headerRef}
            tabIndex={-1}
            data-testid="map-header"
            className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2"
        >
            <div className="flex shrink-0 items-center gap-2">
                <MessagesSquare className="size-5" aria-hidden />
                <h1 className="text-lg font-semibold">{l.title}</h1>
            </div>
            <TabsList aria-label={l.display}>
                {(['map', 'list', 'growth'] as const).map((item) => {
                    const Icon = { map: Network, list: List, growth: Sprout }[item]
                    return (
                        <TabsTrigger key={item} value={item} className="px-2.5">
                            <Icon className="size-4" aria-hidden />
                            {l[item]}
                        </TabsTrigger>
                    )
                })}
            </TabsList>
            <SearchSelect
                key={revision}
                cache={optionCache}
                label={l.project}
                placeholder={l.searchProjects}
                value={projectId ?? 'unassigned'}
                selectedLabel={
                    projectId
                        ? (page?.projects?.find((project) => project.id === projectId)?.name ??
                          page?.projectTitle ??
                          l.project)
                        : l.unassigned
                }
                scopeKey="projects"
                labels={l}
                className="w-52 max-w-full"
                fixedChoices={[{ value: 'unassigned', label: l.unassigned }]}
                load={(search, offset) => readOptions({ kind: 'projects', search, offset })}
                onChange={(value) =>
                    update({
                        projectId: value === 'unassigned' ? null : value,
                        trailConversationId: undefined,
                        trailThreadId: undefined,
                        trailMessageId: undefined
                    })
                }
            />
            <InputGroup className="min-w-40 flex-1">
                <InputGroupAddon>
                    <Search aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                    aria-label={l.search}
                    placeholder={l.search}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
            </InputGroup>
        </header>
    )
}

export function MapToolbar({
    prefs,
    update,
    labels: l,
    searching,
    segments,
    busy
}: Controls & { searching: boolean; segments: boolean; busy: boolean }) {
    const map = prefs.mode === 'tree' || prefs.mode === 'graph'
    return (
        <div data-testid="map-toolbar" className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2">
            {map && !searching && (
                <>
                    <ChoiceSelect
                        label={l.mapView}
                        className="w-40"
                        value={preferredMapMode(prefs)}
                        onChange={(mode) => {
                            if (mode === 'tree' || mode === 'graph') update({ mode })
                        }}
                        choices={[
                            { value: 'tree', label: l.branchPaths },
                            { value: 'graph', label: l.conversationRelations }
                        ]}
                    />
                    <ChoiceSelect
                        label={l.direction}
                        value={prefs.direction}
                        onChange={(direction) => {
                            if (direction === 'LR' || direction === 'TB') update({ direction })
                        }}
                        choices={[
                            { value: 'TB', label: l.vertical },
                            { value: 'LR', label: l.horizontal }
                        ]}
                    />
                </>
            )}
            {(!map || searching) && <h2 className="text-sm font-medium">{searching ? l.matching : l.list}</h2>}
            <HistoryToggle prefs={prefs} update={update} labels={l} className="hidden sm:flex" />
            <span className="flex-1" />
            {busy && <Loader2 className="size-4 animate-spin" aria-label={l.loading} />}
            <DisplaySettings
                labels={l}
                prefs={prefs}
                update={update}
                segments={segments}
                nodeStyles={map && !searching}
            />
        </div>
    )
}
