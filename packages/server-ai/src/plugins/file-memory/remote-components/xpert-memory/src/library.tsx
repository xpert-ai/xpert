import { StandardReply } from './standard-reply'
import { useEffect, useState } from 'react'
import { Archive, ArrowLeft, FileText, Pencil, Plus, Search } from 'lucide-react'
import { z } from 'zod'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
    Button,
    Card,
    CardContent,
    Input,
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
    Label,
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Separator,
    Textarea,
    cn
} from '@xpert-ai/shadcn-ui'
import { library, mutate, noteDetail, types, useQuery, type Note } from './data'
import { Evidence, Notice, Pager, Status, useLabel, useText } from './shared'

export function Library({
    refresh,
    initialId,
    syncScope
}: {
    refresh: number
    initialId?: string
    syncScope: (s: string, studio: boolean) => void
}) {
    const t = useText(),
        label = useLabel()
    const [search, setSearch] = useState(''),
        [type, setType] = useState(''),
        [status, setStatus] = useState(initialId ? 'all' : 'active'),
        [page, setPage] = useState(1)
    const [selected, select] = useState(initialId ?? ''),
        [mobile, setMobile] = useState(!!initialId),
        [creating, create] = useState(false),
        [revision, reload] = useState(0)
    const q = useQuery(library, 'library', refresh + revision, { search, type, status, page })
    const selectedId = selected || q.data?.rows[0]?.id
    useEffect(() => {
        if (q.data) syncScope(q.data.scopeName ?? '', q.data.studio)
    }, [q.data])
    const reset = () => {
        setPage(1)
        select('')
        setMobile(false)
        create(false)
    }
    function open(id: string) {
        select(id)
        setMobile(true)
        create(false)
    }
    return (
        <div className="grid h-full min-w-0 grid-rows-1 min-[621px]:grid-cols-[minmax(13rem,34%)_minmax(0,1fr)]">
            <aside
                className={cn(
                    'min-w-0 space-y-3 overflow-y-auto py-4 min-[621px]:border-r min-[621px]:pr-4',
                    mobile && 'max-[620px]:hidden'
                )}
            >
                <InputGroup>
                    <InputGroupAddon>
                        <Search aria-hidden="true" />
                    </InputGroupAddon>
                    <InputGroupInput
                        aria-label={t('搜索记忆', 'Search memory')}
                        placeholder={t('搜索记忆', 'Search memory')}
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value)
                            reset()
                        }}
                    />
                </InputGroup>
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={type || 'all'}
                        onValueChange={(v) => {
                            setType(v === 'all' ? '' : v)
                            reset()
                        }}
                    >
                        <SelectTrigger aria-label={t('记忆类型', 'Type')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="all">{t('所有类型', 'All types')}</SelectItem>
                                {types.map((v) => (
                                    <SelectItem key={v} value={v}>
                                        {label(v)}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Select
                        value={status}
                        onValueChange={(v) => {
                            setStatus(v)
                            reset()
                        }}
                    >
                        <SelectTrigger aria-label={t('状态', 'Status')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="active">{t('当前', 'Current')}</SelectItem>
                                <SelectItem value="archived">{t('已归档', 'Archived')}</SelectItem>
                                <SelectItem value="all">{t('全部', 'All')}</SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    {q.data?.canEdit && (
                        <Button
                            variant="outline"
                            size="icon"
                            aria-label={t('新增记忆', 'New memory')}
                            onClick={() => {
                                create(true)
                                setMobile(true)
                            }}
                        >
                            <Plus />
                        </Button>
                    )}
                </div>
                {!q.data ? (
                    <Notice error={q.error} />
                ) : (
                    <>
                        <div className="flex flex-col gap-1">
                            {q.data.rows.map((row) => (
                                <Button
                                    key={row.id}
                                    variant={!creating && selectedId === row.id ? 'secondary' : 'ghost'}
                                    aria-current={!creating && selectedId === row.id ? 'true' : undefined}
                                    className="h-auto w-full justify-start gap-2 py-2 text-left"
                                    onClick={() => open(row.id)}
                                >
                                    <FileText />
                                    <span className="grid min-w-0 flex-1 gap-1">
                                        <span className="truncate font-medium">{row.title}</span>
                                        <span className="truncate text-xs font-normal text-muted-foreground">
                                            {row.summary}
                                        </span>
                                    </span>
                                </Button>
                            ))}
                        </div>
                        {!q.data.rows.length && <Notice>{t('没有匹配的记忆', 'No matching memories')}</Notice>}
                        <Pager
                            {...q.data}
                            set={(n) => {
                                setPage(n)
                                select('')
                            }}
                        />
                    </>
                )}
            </aside>
            <article
                className={cn(
                    'min-w-0 space-y-5 overflow-y-auto py-4 min-[621px]:pl-5',
                    !mobile && 'max-[620px]:hidden'
                )}
            >
                <Button
                    variant="ghost"
                    className="min-[621px]:hidden"
                    onClick={() => {
                        setMobile(false)
                        create(false)
                    }}
                >
                    <ArrowLeft />
                    {t('记忆库', 'Library')}
                </Button>
                {creating ? (
                    <NoteEditor
                        key="new"
                        cancel={() => create(false)}
                        saved={(id) => {
                            reload((n) => n + 1)
                            open(id)
                        }}
                    />
                ) : selectedId ? (
                    <NotePage
                        key={selectedId}
                        id={selectedId}
                        revision={refresh + revision}
                        changed={() => reload((n) => n + 1)}
                        archived={() => {
                            reset()
                            reload((n) => n + 1)
                        }}
                    />
                ) : (
                    <Notice>{t('选择一条记忆查看内容', 'Select a memory to view its contents')}</Notice>
                )}
            </article>
        </div>
    )
}
function NotePage({
    id,
    revision,
    changed,
    archived
}: {
    id: string
    revision: number
    changed: () => void
    archived: () => void
}) {
    const t = useText(),
        label = useLabel(),
        q = useQuery(noteDetail, 'note', revision, { id })
    const [edit, setEdit] = useState<Note | null>(null),
        [confirm, setConfirm] = useState(false),
        [busy, setBusy] = useState(false),
        [error, setError] = useState('')
    if (edit)
        return (
            <NoteEditor
                original={edit}
                cancel={() => setEdit(null)}
                saved={() => {
                    setEdit(null)
                    changed()
                }}
            />
        )
    if (!q.data) return <Notice error={q.error} />
    const n = q.data.note
    async function archive() {
        setBusy(true)
        try {
            await mutate('archive', { id, revision: n.revision })
            archived()
        } catch (e) {
            setError(String(e))
            setConfirm(false)
        } finally {
            setBusy(false)
        }
    }
    return (
        <>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <small className="text-muted-foreground">{label(n.type)}</small>
                    <h2 className="text-lg font-semibold wrap-anywhere">{n.title}</h2>
                </div>
                {q.data.canEdit && n.status !== 'archived' && (
                    <Button onClick={() => setEdit(n)}>
                        <Pencil />
                        {t('编辑笔记', 'Edit note')}
                    </Button>
                )}
            </div>
            {n.status === 'archived' && <Status value={n.status} />}
            <section className="space-y-2">
                <h3 className="font-semibold">{t('当前记忆', 'Current memory')}</h3>
                {n.summary && <p className="text-muted-foreground">{n.summary}</p>}
                <div className="leading-relaxed whitespace-pre-wrap wrap-anywhere">{n.content}</div>
            </section>
            <StandardReply
                key={n.revision + (n.reply?.id ?? '')}
                note={n}
                editable={q.data.canEdit}
                changed={changed}
            />
            <Evidence id={id} kind="note" count={n.sourceRefs.length} />
            <Separator />
            <section className="space-y-1">
                <h3 className="font-semibold">{t('变更记录', 'History')}</h3>
                <p>
                    <time className="text-xs text-muted-foreground">{new Date(n.updatedAt).toLocaleString()}</time> ·{' '}
                    {n.status === 'archived' ? t('已归档', 'Archived') : t('当前版本', 'Current revision')}
                </p>
                {n.createdAt && n.createdAt !== n.updatedAt && (
                    <p>
                        <time className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</time>{' '}
                        · {t('创建笔记', 'Note created')}
                    </p>
                )}
            </section>
            {q.data.canEdit && n.status !== 'archived' && (
                <div className="flex justify-end">
                    <AlertDialog
                        open={confirm}
                        onOpenChange={(open) => {
                            if (!busy) setConfirm(open)
                        }}
                    >
                        <AlertDialogTrigger asChild>
                            <Button variant="outline">
                                <Archive />
                                {t('归档', 'Archive')}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent size="sm">
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t('归档这条笔记？', 'Archive this note?')}</AlertDialogTitle>
                                <AlertDialogDescription>{n.title}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={busy}>{t('取消', 'Cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                    disabled={busy}
                                    onClick={(e) => {
                                        e.preventDefault()
                                        void archive()
                                    }}
                                >
                                    {t('确认归档', 'Confirm archive')}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            )}
            {error && <Notice error={error} />}
        </>
    )
}
function NoteEditor({ original, cancel, saved }: { original?: Note; cancel: () => void; saved: (id: string) => void }) {
    const t = useText(),
        label = useLabel(),
        [title, setTitle] = useState(original?.title ?? ''),
        [summary, setSummary] = useState(original?.summary ?? ''),
        [content, setContent] = useState(original?.content ?? ''),
        [type, setType] = useState<Note['type']>(original?.type ?? 'project')
    const [base, setBase] = useState(original?.revision),
        [busy, setBusy] = useState(false),
        [error, setError] = useState(''),
        [rev, refresh] = useState(0)
    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setBusy(true)
        try {
            const data = await mutate(
                original ? 'save' : 'create',
                original
                    ? { id: original.id, revision: base, title, summary, content }
                    : { type, title, summary, content }
            )
            saved(z.object({ memoryId: z.string() }).parse(data).memoryId)
        } catch (e) {
            setError(String(e))
            refresh((n) => n + 1)
        } finally {
            setBusy(false)
        }
    }
    return (
        <form className="space-y-4" onSubmit={submit}>
            <h2 className="text-lg font-semibold">
                {original ? t('编辑笔记', 'Edit note') : t('新增记忆', 'New memory')}
            </h2>
            {!original && (
                <div className="grid gap-2">
                    <Label htmlFor="note-type">{t('类型', 'Type')}</Label>
                    <Select value={type} onValueChange={(value) => setType(z.enum(types).parse(value))}>
                        <SelectTrigger id="note-type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                {types.map((v) => (
                                    <SelectItem key={v} value={v}>
                                        {label(v)}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                </div>
            )}
            <div className="grid gap-2">
                <Label htmlFor="note-title">{t('标题', 'Title')}</Label>
                <Input
                    id="note-title"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="note-summary">{t('摘要', 'Summary')}</Label>
                <Input
                    id="note-summary"
                    required
                    maxLength={1200}
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                />
            </div>
            <div className="grid gap-2">
                <Label htmlFor="note-content">{t('笔记内容', 'Note content')}</Label>
                <Textarea
                    id="note-content"
                    className="min-h-32"
                    required
                    rows={8}
                    maxLength={32000}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />
            </div>
            {error && <Notice error={error} />}{' '}
            {original && error && (
                <Latest
                    id={original.id}
                    base={base!}
                    refresh={rev}
                    accept={(revision) => {
                        setBase(revision)
                        setError('')
                    }}
                />
            )}
            <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" type="button" onClick={cancel}>
                    {t('取消', 'Cancel')}
                </Button>
                <Button type="submit" disabled={busy}>
                    {t('保存笔记', 'Save note')}
                </Button>
            </div>
        </form>
    )
}
function Latest({
    id,
    base,
    refresh,
    accept
}: {
    id: string
    base: string
    refresh: number
    accept: (revision: string) => void
}) {
    const t = useText(),
        q = useQuery(noteDetail, 'note', refresh, { id })
    if (!q.data || q.data.note.revision === base) return null
    const latest = q.data.note
    return (
        <Card size="sm">
            <CardContent className="space-y-2">
                <h3 className="font-semibold">{t('当前保存的版本', 'Latest saved version')}</h3>
                <b>{latest.title}</b>
                <p>{latest.summary}</p>
                <blockquote className="whitespace-pre-wrap wrap-anywhere">{latest.content}</blockquote>
                <Button variant="outline" type="button" onClick={() => accept(latest.revision)}>
                    {t('已对照，以此版本继续编辑', 'Use this revision as the editing base')}
                </Button>
            </CardContent>
        </Card>
    )
}
