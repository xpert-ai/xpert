import { useState, type FormEvent } from 'react'
import { Button, Input, Label, Switch } from '@xpert-ai/shadcn-ui'
import type { z } from 'zod'
import { mutate, settings, useQuery } from './data'
import { Notice, useText } from './shared'

type Close = (saved?: boolean) => void

export function DreamSettings({ close, refresh }: { close: Close; refresh: number }) {
    const q = useQuery(settings, 'settings', refresh)
    const t = useText()
    if (!q.data)
        return (
            <>
                <Notice error={q.error} />
                {q.error && (
                    <Button variant="outline" onClick={() => close()}>
                        {t('返回', 'Back')}
                    </Button>
                )}
            </>
        )
    return <Form data={q.data} close={close} />
}

function Form({ data: { config }, close }: { data: z.infer<typeof settings>; close: Close }) {
    const t = useText()
    const [busy, setBusy] = useState(false),
        [error, setError] = useState('')
    const initialGate = {
        enabled: true,
        minIntervalMinutes: 30,
        minNewOrUpdatedMemories: 1,
        minConversationCount: 1,
        ...config.defaults.gate,
        ...config.gate
    }
    const [enabled, setEnabled] = useState(initialGate.enabled)
    const fields = [
        ['minIntervalMinutes', t('最短间隔（分钟）', 'Minimum interval (minutes)'), 525600],
        ['minNewOrUpdatedMemories', t('最少新增或更新笔记', 'Minimum changed notes'), 100000],
        ['minConversationCount', t('最少有记忆信号的会话', 'Minimum conversations with memory signals'), 100000]
    ] as const
    const [limits, setLimits] = useState({
        minIntervalMinutes: String(initialGate.minIntervalMinutes),
        minNewOrUpdatedMemories: String(initialGate.minNewOrUpdatedMemories),
        minConversationCount: String(initialGate.minConversationCount)
    })
    async function save(e: FormEvent) {
        e.preventDefault()
        setBusy(true)
        setError('')
        try {
            const gate = { ...initialGate, enabled }
            for (const [key] of fields) gate[key] = limits[key] === '' ? initialGate[key] : Number(limits[key])
            await mutate('configure', { gate })
            close(true)
        } catch (e) {
            setError(String(e))
        } finally {
            setBusy(false)
        }
    }
    return (
        <form className="max-w-3xl space-y-5 py-4" onSubmit={save}>
            <h2 className="text-lg font-semibold">{t('Dream 整理设置', 'Dream settings')}</h2>
            <div className="space-y-1">
                <h3 className="font-medium">{t('整理模型', 'Consolidation model')}</h3>
                <p className="text-muted-foreground">
                    {t(
                        '跟随当前助手主智能体的模型。Dream 对照原始会话核验每项修改，证据不足的内容列为待确认。',
                        'Uses the current assistant’s primary agent model. Dream verifies changes against original conversations and flags unsupported details for confirmation.'
                    )}
                </p>
            </div>
            <section className="space-y-3 border-t pt-4">
                <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="dream-gate">{t('运行前检查整理条件', 'Check conditions before each run')}</Label>
                    <Switch id="dream-gate" checked={enabled} onCheckedChange={setEnabled} />
                </div>
                <p className="text-muted-foreground">
                    {enabled
                        ? t(
                              '首次运行直接整理。此后从上一次完成整理起计算，三项条件都满足才会执行，否则本次记为「已跳过」。',
                              'The first run proceeds immediately. Later runs are skipped unless all three minimums have been met since the last completed run.'
                          )
                        : t(
                              '每次发起整理时直接执行，跳过间隔、笔记数和会话数检查。',
                              'Each requested run proceeds without checking time, changed notes or conversations.'
                          )}
                </p>
                {enabled && (
                    <div className="grid gap-3 sm:grid-cols-3">
                        {fields.map(([key, label, max]) => (
                            <div key={key} className="grid content-start gap-2">
                                <Label htmlFor={key}>{label}</Label>
                                <Input
                                    id={key}
                                    type="number"
                                    required
                                    min={0}
                                    max={max}
                                    step={1}
                                    value={limits[key]}
                                    onChange={(e) => setLimits({ ...limits, [key]: e.target.value })}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </section>
            {error && <Notice error={error} />}
            <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="outline" disabled={busy} onClick={() => close()}>
                    {t('返回', 'Back')}
                </Button>
                <Button type="submit" disabled={busy}>
                    {busy ? t('正在保存…', 'Saving…') : t('保存设置', 'Save settings')}
                </Button>
            </div>
        </form>
    )
}
