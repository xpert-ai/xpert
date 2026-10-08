import { CalendarDays, LocateFixed, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import {
    ToggleGroup,
    ToggleGroupItem,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator
} from '@xpert-ai/shadcn-ui'
import type { Scale } from './model'
import type { Texts } from './i18n'
import { Choice, IconButton } from './ui'

export type TimelineControlsProps = {
    scale: Scale
    setScale: (scale: Scale) => void
    date: string
    zoom: number
    canZoomIn: boolean
    canZoomOut: boolean
    zoomIn: () => void
    zoomOut: () => void
    fit: () => void
    locate: () => void
}
export function TimelineControls({
    controls,
    t,
    compact
}: {
    controls: TimelineControlsProps
    t: Texts
    compact: boolean
}) {
    const scales = (['hour', 'day', 'week'] as const).map((value) => ({ value, label: t[value] }))
    return (
        <div className="flex shrink-0 items-center gap-1 border-l pl-2" aria-label={t.timelineControls}>
            {!compact && (
                <span className="mr-2 flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                    <CalendarDays className="size-4" />
                    {controls.date}
                </span>
            )}
            {compact ? (
                <Choice
                    label={t.timeScale}
                    value={controls.scale}
                    options={scales}
                    onChange={(value) => {
                        if (value === 'hour' || value === 'day' || value === 'week') controls.setScale(value)
                    }}
                />
            ) : (
                <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={controls.scale}
                    aria-label={t.timeScale}
                    onValueChange={(value) => {
                        if (value === 'hour' || value === 'day' || value === 'week') controls.setScale(value)
                    }}
                >
                    {scales.map(({ value, label }) => (
                        <ToggleGroupItem key={value} value={value}>
                            {label}
                        </ToggleGroupItem>
                    ))}
                </ToggleGroup>
            )}
            <IconButton label={t.zoomOut} disabled={!controls.canZoomOut} onClick={controls.zoomOut}>
                <ZoomOut />
            </IconButton>
            {!compact && (
                <span className="w-10 text-center text-xs tabular-nums text-muted-foreground" aria-label={t.timeZoom}>
                    {controls.zoom}%
                </span>
            )}
            <IconButton label={t.zoomIn} disabled={!controls.canZoomIn} onClick={controls.zoomIn}>
                <ZoomIn />
            </IconButton>
            <IconButton label={t.fit} onClick={controls.fit}>
                <Maximize2 />
            </IconButton>
            {!compact && (
                <IconButton label={t.locate} onClick={controls.locate}>
                    <LocateFixed />
                </IconButton>
            )}
        </div>
    )
}

export function TimelineMenuItems({
    controls,
    t,
    compact
}: {
    controls: TimelineControlsProps
    t: Texts
    compact: boolean
}) {
    return (
        <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
                {t.timelineControls} · {controls.date}
            </DropdownMenuLabel>
            {compact && (
                <>
                    <DropdownMenuRadioGroup
                        value={controls.scale}
                        onValueChange={(value) => {
                            if (value === 'hour' || value === 'day' || value === 'week') controls.setScale(value)
                        }}
                    >
                        {(['hour', 'day', 'week'] as const).map((value) => (
                            <DropdownMenuRadioItem key={value} value={value}>
                                {t[value]}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>
                        {t.timeZoom} · {controls.zoom}%
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                        disabled={!controls.canZoomOut}
                        onSelect={(event) => {
                            event.preventDefault()
                            controls.zoomOut()
                        }}
                    >
                        <ZoomOut />
                        {t.zoomOut}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        disabled={!controls.canZoomIn}
                        onSelect={(event) => {
                            event.preventDefault()
                            controls.zoomIn()
                        }}
                    >
                        <ZoomIn />
                        {t.zoomIn}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={controls.fit}>
                        <Maximize2 />
                        {t.fit}
                    </DropdownMenuItem>
                </>
            )}
            <DropdownMenuItem onSelect={controls.locate}>
                <LocateFixed />
                {t.locate}
            </DropdownMenuItem>
        </>
    )
}
