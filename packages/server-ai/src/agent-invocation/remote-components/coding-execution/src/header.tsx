import type { ExecutionI18n } from './i18n/core'
import { CodingToolIcon } from '../../../../shared/coding-tools/coding-tool-icon'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import { CheckCircle2, CircleAlert, Copy, LoaderCircle, Pause, Play, Search } from 'lucide-react'
import { stateLabel } from './model'

export type Palette = 'host' | 'paper' | 'coal' | 'navy'
type HeaderState = {
    title: string
    toolId?: string
    provider?: string
    status?: string
    following: boolean
    palette: Palette
    i18n: ExecutionI18n
}
type HeaderActions = { search(): void; follow(): void; copy(): void; theme(value: Palette): void }

function Header({
    title,
    toolId,
    provider,
    status,
    following,
    palette,
    i18n,
    actions
}: HeaderState & { actions: HeaderActions }) {
    const running = status === 'running'
    const StatusIcon =
        status === 'succeeded' ? CheckCircle2 : status === 'failed' ? CircleAlert : running ? LoaderCircle : Pause
    const followLabel = following ? i18n.t('header.pauseFollow') : i18n.t('header.resumeFollow')
    const themes: Array<{ value: Palette; label: string }> = [
        { value: 'host', label: i18n.t('palette.host') },
        { value: 'paper', label: i18n.t('palette.paper') },
        { value: 'coal', label: i18n.t('palette.coal') },
        { value: 'navy', label: i18n.t('palette.navy') }
    ]
    return (
        <header className="viewer-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background px-5 py-3 font-sans text-foreground">
            <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold break-words max-[720px]:w-full">
                <CodingToolIcon toolId={toolId} provider={provider} className="size-5" decorative />
                {title}
            </h1>
            <div className="header-actions flex flex-wrap items-center gap-1.5 max-[720px]:w-full">
                <Badge variant="outline" role="status" className="execution-status" data-status={status}>
                    {status && <StatusIcon aria-hidden className="size-3.5" />}
                    {status ? stateLabel(status, i18n) : null}
                </Badge>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={i18n.t('header.search')}
                    title={i18n.t('header.search')}
                    onClick={actions.search}
                >
                    <Search aria-hidden />
                </Button>
                <Button variant="ghost" size="sm" aria-label={followLabel} title={followLabel} onClick={actions.follow}>
                    {following ? <Pause aria-hidden /> : <Play aria-hidden />}
                    {followLabel}
                </Button>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={i18n.t('header.copyTranscript')}
                    title={i18n.t('header.copyTranscript')}
                    onClick={actions.copy}
                >
                    <Copy aria-hidden />
                </Button>
                <Select
                    value={palette}
                    onValueChange={(value) => {
                        const theme = themes.find((theme) => theme.value === value)
                        if (theme) actions.theme(theme.value)
                    }}
                >
                    <SelectTrigger
                        size="sm"
                        aria-label={i18n.t('header.colorTheme')}
                        className="min-w-24 max-[720px]:ml-auto"
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="end">
                        {themes.map((theme) => (
                            <SelectItem key={theme.value} value={theme.value}>
                                {theme.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
        </header>
    )
}

/** React owns only the header, never the selected/scrolling transcript DOM. */
export class ExecutionHeader {
    readonly element = document.createElement('div')
    private root: Root
    constructor(private actions: HeaderActions) {
        this.root = createRoot(this.element)
    }
    update(state: HeaderState) {
        flushSync(() => this.root.render(<Header {...state} actions={this.actions} />))
    }
}
