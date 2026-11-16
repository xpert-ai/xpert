import {
    ClipboardList,
    GitBranch,
    GitPullRequest,
    Inbox,
    MessageSquare,
    MousePointer2,
    Package,
    Send,
    Workflow
} from 'lucide-react'
const glyphs = new Map([
    ['git-branch', GitBranch],
    ['git-pull-request', GitPullRequest],
    ['workflow', Workflow],
    ['clipboard-list', ClipboardList],
    ['package', Package],
    ['send', Send],
    ['message-square', MessageSquare],
    ['mouse-pointer', MousePointer2]
])
export function TypeIcon({ icon }: { icon?: { type: string; value: string } }) {
    if (icon?.type === 'emoji') return <span aria-hidden="true">{icon.value}</span>
    if (icon?.type === 'svg' && icon.value.trimStart().startsWith('<svg')) {
        return (
            <img
                alt=""
                className="size-4 shrink-0"
                src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(icon.value)}
            />
        )
    }
    if (icon?.type === 'image' && /^(?:https:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(icon.value)) {
        return <img alt="" className="size-4 shrink-0" src={icon.value} referrerPolicy="no-referrer" />
    }
    const Glyph = (icon?.type === 'font' && glyphs.get(icon.value)) || Inbox
    return <Glyph aria-hidden="true" size={16} className="shrink-0" />
}
