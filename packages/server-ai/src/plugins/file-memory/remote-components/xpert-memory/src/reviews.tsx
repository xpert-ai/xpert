import { useState } from 'react'
import { ArrowLeft, ChevronRight, Pencil } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@xpert-ai/shadcn-ui'
import { reviews, reviewDetail, useQuery } from './data'
import { Evidence, Notice, Pager, Status, useText } from './shared'

export function Reviews({ refresh, edit }: { refresh: number; edit: (id: string) => void }) {
    const [id, select] = useState(''),
        [page, setPage] = useState(1),
        t = useText()
    const q = useQuery(reviews, 'reviews', refresh, { page })
    if (id) return <Review id={id} refresh={refresh} back={() => select('')} edit={edit} />
    return (
        <div className="space-y-4 py-4">
            <h2 className="text-lg font-semibold wrap-anywhere">{t('复核记录', 'Review history')}</h2>
            {!q.data ? (
                <Notice error={q.error} />
            ) : !q.data.rows.length ? (
                <Notice>
                    {t(
                        '还没有复核记录。候选记忆核对原文后，结果会显示在这里。',
                        'After a proposed memory is checked against its source, the review appears here.'
                    )}
                </Notice>
            ) : (
                <>
                    <div className="grid gap-1">
                        {q.data.rows.map((row) => (
                            <Button
                                variant="ghost"
                                className="h-auto w-full justify-start gap-3 py-2 text-left"
                                key={row.id}
                                onClick={() => select(row.id)}
                            >
                                <span className="grid min-w-0 flex-1 gap-1">
                                    <span className="truncate font-medium">
                                        {row.title || t('历史复核记录', 'Historical review')}
                                    </span>
                                    <small className="text-xs font-normal text-muted-foreground">
                                        {new Date(row.checkedAt).toLocaleString()}
                                    </small>
                                </span>
                                <Status value={row.outcome} />
                                <ChevronRight />
                            </Button>
                        ))}
                    </div>
                    <Pager {...q.data} set={setPage} />
                </>
            )}
        </div>
    )
}
function Review({
    id,
    refresh,
    back,
    edit
}: {
    id: string
    refresh: number
    back: () => void
    edit: (id: string) => void
}) {
    const t = useText(),
        q = useQuery(reviewDetail, 'review', refresh, { id })
    if (!q.data) return <Notice error={q.error} />
    const r = q.data.review,
        p = r.proposal
    return (
        <div className="space-y-4 py-4">
            <Button variant="ghost" onClick={back}>
                <ArrowLeft />
                {t('返回复核记录', 'Back to reviews')}
            </Button>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold wrap-anywhere">
                    {(p?.action === 'upsert' && p.title) || r.before?.title || t('复核详情', 'Review details')}
                </h2>
                <Status value={r.outcome} />
            </div>
            <small className="text-xs font-normal text-muted-foreground">
                {new Date(r.checkedAt).toLocaleString()}
            </small>
            <section className="grid gap-3 min-[621px]:grid-cols-2">
                <Card size="sm">
                    <CardHeader>
                        <CardTitle>{t('原笔记', 'Original note')}</CardTitle>
                    </CardHeader>
                    <CardContent className="leading-relaxed whitespace-pre-wrap wrap-anywhere">
                        {r.before?.content || t('未留存原笔记快照', 'No original snapshot recorded')}
                    </CardContent>
                </Card>
                <Card size="sm">
                    <CardHeader>
                        <CardTitle>{t('拟写入的笔记', 'Proposed change')}</CardTitle>
                    </CardHeader>
                    <CardContent className="leading-relaxed whitespace-pre-wrap wrap-anywhere">
                        {p?.action === 'upsert'
                            ? p.content
                            : p?.action === 'archive'
                              ? p.reason
                              : t('未留存提案快照', 'No proposal snapshot recorded')}
                    </CardContent>
                </Card>
            </section>
            <Evidence kind="review" id={id} count={r.sourceRefs.length} />
            {r.reason && (
                <section className="space-y-2">
                    <h3 className="font-semibold">{t('复核理由', 'Reason')}</h3>
                    <p>{r.reason}</p>
                </section>
            )}
            {q.data.canEdit && (r.baseRevision || r.outcome === 'applied') && (
                <Button onClick={() => edit(r.memoryId)}>
                    <Pencil />
                    {t('打开当前笔记修正', 'Correct current note')}
                </Button>
            )}
        </div>
    )
}
