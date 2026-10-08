import { CodingToolIcon } from '../../../../shared/coding-tools/coding-tool-icon'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { Badge, Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@xpert-ai/shadcn-ui'
import { CheckCircle2, CircleAlert, Copy, LoaderCircle, Pause, Play, Search } from 'lucide-react'
import { stateLabel, type Label } from './model'

export type Palette = 'host' | 'paper' | 'coal' | 'navy'
type HeaderState = {
    title: string
    toolId?: string
    provider?: string
    status?: string
    following: boolean
    palette: Palette
    label: Label
}
type HeaderActions = { search(): void; follow(): void; copy(): void; theme(value: Palette): void }

function Header({
    title,
    toolId,
    provider,
    status,
    following,
    palette,
    label,
    actions
}: HeaderState & { actions: HeaderActions }) {
    const running = status === 'running'
    const StatusIcon =
        status === 'succeeded' ? CheckCircle2 : status === 'failed' ? CircleAlert : running ? LoaderCircle : Pause
    const followLabel = following ? label('Pause follow', '暂停跟随') : label('Resume follow', '恢复跟随')
    const themes: Array<{ value: Palette; label: string }> = [
        { value: 'host', label: label('Host theme', '跟随宿主') },
        { value: 'paper', label: label('Paper', '纸白') },
        { value: 'coal', label: label('Charcoal', '炭黑') },
        { value: 'navy', label: label('Midnight', '深蓝') }
    ]
    return (
        <header className="viewer-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background px-5 py-3 font-sans text-foreground">
            <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold break-words max-[720px]:w-full">
                <CodingToolIcon toolId={toolId} provider={provider} className="size-5" decorative />
                {title}
            </h1>
            <div className="header-actions flex flex-wrap items-center gap-1.5 max-[720px]:w-full">
                <Badge
                    variant="outline"
                    role="status"
                    className="execution-status gap-1.5 border-0 px-1.5 text-xs"
                    data-status={status}
                >
                    {status && <StatusIcon aria-hidden className="size-3.5" />}
                    {status ? stateLabel(status, label) : null}
                </Badge>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={label('Search (/)', '搜索（/）')}
                    title={label('Search (/)', '搜索（/）')}
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
                    aria-label={label('Copy transcript', '复制过程')}
                    title={label('Copy transcript', '复制过程')}
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
                        aria-label={label('Color theme', '颜色主题')}
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
