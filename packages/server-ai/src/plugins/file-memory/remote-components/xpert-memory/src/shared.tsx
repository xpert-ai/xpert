import { createContext, useContext, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Badge,
    Button,
    Pagination,
    PaginationContent,
    PaginationItem
} from '@xpert-ai/shadcn-ui'
import { evidence, useQuery } from './data'
export const Language = createContext('en-US')
export function useText() {
    const locale = useContext(Language)
    return (zh: string, en: string) => (locale.startsWith('zh') ? zh : en)
}
const labels: Record<string, [string, string]> = {
    project: ['项目规则', 'Project'],
    user: ['用户偏好', 'User'],
    feedback: ['反馈', 'Feedback'],
    reference: ['参考资料', 'Reference'],
    applied: ['已应用', 'Applied'],
    unsupported: ['证据不支持', 'Unsupported'],
    unresolved: ['待核实', 'Unresolved'],
    missing_evidence: ['缺少证据', 'Missing evidence'],
    target_changed: ['笔记已更改', 'Note changed'],
    queued: ['已排队', 'Queued'],
    running: ['整理中', 'Running'],
    succeeded: ['完成', 'Completed'],
    partial: ['部分完成', 'Partial'],
    failed: ['失败', 'Failed'],
    cancelled: ['已取消', 'Cancelled'],
    skipped: ['已跳过', 'Skipped'],
    manual: ['手动整理', 'Manual'],
    scheduled: ['定时整理', 'Scheduled'],
    signal_threshold: ['信号触发', 'Signal threshold'],
    created: ['新增', 'Created'],
    updated: ['更新', 'Updated'],
    archived: ['已归档', 'Archived'],
    source: ['消息来源', 'Message source'],
    human: ['用户', 'User'],
    ai: ['助手', 'Assistant'],
    tool: ['工具输出', 'Tool output']
}
export function useLabel() {
    const t = useText()
    return (v: string) => (labels[v] ? t(...labels[v]) : v)
}
export function Status({ value }: { value: string }) {
    const label = useLabel()
    return <Badge variant={value === 'failed' ? 'destructive' : 'secondary'}>{label(value)}</Badge>
}
export function Notice({ error, children }: { error?: string; children?: ReactNode }) {
    const t = useText()
    return (
        <p
            role={error ? 'alert' : 'status'}
            className={error ? 'py-3 wrap-anywhere text-destructive' : 'py-3 text-muted-foreground'}
        >
            {error || children || t('正在加载…', 'Loading…')}
        </p>
    )
}
export function Pager({ total, page, set }: { total: number; page: number; set: (n: number) => void }) {
    const t = useText()
    return total > 20 ? (
        <Pagination aria-label={t('分页', 'Pagination')} className="mt-4 justify-end">
            <PaginationContent>
                <PaginationItem>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label={t('上一页', 'Previous page')}
                        disabled={page < 2}
                        onClick={() => set(page - 1)}
                    >
                        <ChevronLeft />
                    </Button>
                </PaginationItem>
                <PaginationItem className="px-2 text-muted-foreground">
                    {page} / {Math.ceil(total / 20)}
                </PaginationItem>
                <PaginationItem>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label={t('下一页', 'Next page')}
                        disabled={page * 20 >= total}
                        onClick={() => set(page + 1)}
                    >
                        <ChevronRight />
                    </Button>
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    ) : null
}
export function Evidence({ id, kind, count }: { id: string; kind: 'note' | 'review'; count: number }) {
    const t = useText()
    return (
        <section className="space-y-2">
            <h3 className="font-semibold">{t('原始会话证据', 'Conversation evidence')}</h3>
            {!count ? (
                <p className="text-muted-foreground">{t('没有保存来源引用。', 'No source was recorded.')}</p>
            ) : (
                <Accordion type="single" collapsible>
                    <AccordionItem value="source">
                        <AccordionTrigger>
                            <span className="flex items-center gap-2">
                                <Quote className="size-4" />
                                {t('查看原文', 'View source')} · {count}
                            </span>
                        </AccordionTrigger>
                        <AccordionContent>
                            <Sources id={id} kind={kind} />
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            )}
        </section>
    )
}
function Sources({ id, kind }: { id: string; kind: string }) {
    const t = useText(),
        label = useLabel(),
        { data, error } = useQuery(evidence, kind + '-evidence', 0, { id })
    if (!data) return <Notice error={error} />
    return (
        <>
            {!data.evidence.length && <p>{t('来源不可用。', 'Source unavailable.')}</p>}
            {data.evidence.map((s, i) => (
                <div key={i} className="space-y-1 py-2">
                    {s.content ? (
                        <>
                            <small className="text-muted-foreground">
                                {label(s.role ?? '')} {s.state === 'truncated' ? t('· 节选', '· Excerpt') : ''}
                            </small>
                            <blockquote className="border-l-2 pl-3 leading-relaxed whitespace-pre-wrap wrap-anywhere">
                                {s.content}
                            </blockquote>
                        </>
                    ) : s.state === 'conversation' ? (
                        t('历史引用仅定位到会话。', 'Historical reference identifies a conversation only.')
                    ) : (
                        t('原文不可访问或已删除。', 'Source unavailable or deleted.')
                    )}
                </div>
            ))}
        </>
    )
}
