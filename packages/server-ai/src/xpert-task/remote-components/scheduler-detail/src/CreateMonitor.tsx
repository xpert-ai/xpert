import { useRef, useState } from 'react'
import { z } from 'zod'
import { Button, Input, Label, Textarea } from '@xpert-ai/shadcn-ui'
import { MonitorStartFields, defaultFirstRun } from './MonitorStartFields'
import { MonitorSettings } from './MonitorSettings'
import { actionSchema, request, destinationInput, type Destination } from './bridge'
import { texts } from './i18n'

export function CreateMonitor({ threadId, title, locale }: { threadId: string; title: string; locale: string }) {
    const t = texts(locale)
    const [name, setName] = useState(title)
    const [destination, setDestination] = useState<Destination>()
    const [intervalMinutes, setInterval] = useState(30)
    const [prompt, setPrompt] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const [created, setCreated] = useState('')
    const requestId = useRef(crypto.randomUUID())
    const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    const [firstRun, setFirstRun] = useState(() => defaultFirstRun(timeZone, intervalMinutes))
    const [customStart, setCustomStart] = useState(false)

    async function submit() {
        setBusy(true)
        setError('')
        try {
            let taskId = created
            if (!taskId) {
                const result = actionSchema
                    .extend({ success: z.literal(true), data: z.object({ taskId: z.string().uuid() }) })
                    .parse(
                        await request('executeAction', {
                            actionKey: 'create',
                            input: {
                                name: name.trim(),
                                prompt: prompt.trim(),
                                timeZone,
                                firstRun,
                                threadId,
                                destination: destinationInput(destination),
                                intervalMinutes,
                                requestId: requestId.current
                            }
                        })
                    )
                taskId = result.data.taskId
                setCreated(taskId)
            }
            const opened = actionSchema.parse(
                await request('invokeClientCommand', {
                    commandKey: 'workbench.navigation.open',
                    payload: { target: 'workbench.view', viewKey: 'platform.scheduler__detail', selectionId: taskId }
                })
            )
            if (!opened.success) throw Error(t.actionFailed)
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : t.actionFailed)
        } finally {
            setBusy(false)
        }
    }
    return (
        <form
            className="flex h-full flex-col gap-5 overflow-auto bg-background p-5 text-foreground"
            onSubmit={(event) => {
                event.preventDefault()
                void submit()
            }}
        >
            <h1 className="text-lg font-semibold">{t.create}</h1>
            <div className="space-y-2">
                <Label htmlFor="name">{t.name}</Label>
                <Input
                    id="name"
                    value={name}
                    maxLength={100}
                    required
                    disabled={busy || !!created}
                    onChange={(event) => setName(event.target.value)}
                />
            </div>
            <div className="space-y-2">
                <Label htmlFor="prompt">{t.prompt}</Label>
                <Textarea
                    id="prompt"
                    value={prompt}
                    maxLength={16000}
                    rows={6}
                    required
                    disabled={busy || !!created}
                    onChange={(event) => setPrompt(event.target.value)}
                />
            </div>
            <MonitorSettings
                locale={locale}
                currentThreadId={threadId}
                currentTitle={title || t.currentChat}
                destination={destination}
                intervalMinutes={intervalMinutes}
                disabled={busy || !!created}
                onTarget={setDestination}
                onInterval={(minutes) => {
                    setInterval(minutes)
                    if (!customStart && Number.isInteger(minutes) && minutes >= 1 && minutes <= 525600)
                        setFirstRun(defaultFirstRun(timeZone, minutes))
                }}
            />
            <MonitorStartFields locale={locale} firstRun={firstRun} timeZone={timeZone} disabled={busy || !!created}
                onChange={(start) => { setCustomStart(true); setFirstRun(start) }}
                onZone={(zone) => { setCustomStart(true); setTimeZone(zone) }} />
            {error && (
                <p role="alert" className="text-destructive">
                    {error}
                </p>
            )}
            <Button className="mt-auto self-end" type="submit" disabled={busy || !name.trim() || !prompt.trim()}>
                {created ? t.open : t.create}
            </Button>
        </form>
    )
}
