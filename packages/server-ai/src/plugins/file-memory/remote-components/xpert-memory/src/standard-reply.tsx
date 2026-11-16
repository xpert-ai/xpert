import { useState } from 'react'
import { Button, Input, Label, Textarea } from '@xpert-ai/shadcn-ui'
import { mutate, type Note } from './data'
import { Notice, useText } from './shared'

export function StandardReply({ note, editable, changed }: { note: Note; editable: boolean; changed: () => void }) {
    const t = useText()
    const reply = note.reply
    const [editing, edit] = useState(false)
    const [question, setQuestion] = useState(reply?.question ?? '')
    const [aliases, setAliases] = useState(reply?.aliases.join('\n') ?? '')
    const [answer, setAnswer] = useState(reply?.answer ?? note.content.trim())
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const canApprove = editable && note.status === 'active'
    if (!reply && !canApprove) return null
    async function save(remove = false) {
        setBusy(true)
        setError('')
        try {
            await mutate('standard-reply', {
                id: note.id,
                revision: note.revision,
                approvalId: reply?.id ?? null,
                reply: remove
                    ? null
                    : {
                          question,
                          aliases: aliases
                              .split('\n')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          answer
                      }
            })
            edit(false)
            changed()
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    return (
        <section className="space-y-3 border-t pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{t('标准问答', 'Standard reply')}</h3>
                {reply && (
                    <span className="text-sm text-muted-foreground">
                        {reply.active
                            ? t('当前版本已确认', 'Approved for this revision')
                            : t('已失效 · 待重新确认', 'Inactive · approval required')}
                    </span>
                )}
            </div>
            {editing ? (
                <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                        e.preventDefault()
                        void save()
                    }}
                >
                    <Label htmlFor="reply-question">{t('标准问题', 'Standard question')}</Label>
                    <Input
                        id="reply-question"
                        required
                        maxLength={500}
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                    />
                    <Label htmlFor="reply-aliases">
                        {t('等价问法（每行一条）', 'Equivalent questions (one per line)')}
                    </Label>
                    <Textarea id="reply-aliases" value={aliases} onChange={(e) => setAliases(e.target.value)} />
                    <Label htmlFor="reply-answer">
                        {t('直答原文（从当前笔记正文选取）', 'Verbatim answer from this note')}
                    </Label>
                    <Textarea id="reply-answer" required value={answer} onChange={(e) => setAnswer(e.target.value)} />
                    <div className="flex gap-2">
                        <Button
                            type="submit"
                            disabled={
                                busy || !question.trim() || !answer.trim() || !note.content.includes(answer.trim())
                            }
                        >
                            {t('确认当前版本', 'Approve this revision')}
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                                edit(false)
                                setError('')
                            }}
                        >
                            {t('取消', 'Cancel')}
                        </Button>
                    </div>
                </form>
            ) : (
                <>
                    {reply && (
                        <div className="space-y-1">
                            <p className="font-medium">{reply.question}</p>
                            {reply.aliases.map((alias) => (
                                <p key={alias} className="text-sm text-muted-foreground">
                                    {alias}
                                </p>
                            ))}
                            <p className="whitespace-pre-wrap">{reply.answer}</p>
                        </div>
                    )}
                    {canApprove && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                setQuestion(reply?.question ?? '')
                                setAliases(reply?.aliases.join('\n') ?? '')
                                setAnswer(reply?.answer ?? note.content.trim())
                                edit(true)
                            }}
                        >
                            {reply ? t('编辑并确认', 'Edit and approve') : t('设置标准问答', 'Set up a standard reply')}
                        </Button>
                    )}
                    {reply && editable && (
                        <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>
                            {t('移除直答', 'Remove reply')}
                        </Button>
                    )}
                </>
            )}
            {error && <Notice error={error} />}
        </section>
    )
}
