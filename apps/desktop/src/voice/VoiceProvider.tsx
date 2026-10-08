import type { RealtimeVoiceOptions, RealtimeVoiceCall, CompletedVoiceCall } from '@xpert-ai/chatkit-types'
import { createContext, useContext, useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import { Button } from '@xpert-ai/shadcn-ui'
import { Mic, MicOff, PhoneOff, Square, X } from 'lucide-react'
import { t } from '../i18n'
import { invoke } from '../host'
import { VoiceRuntime, type CallTarget, type VoiceState, type VoiceDiagnostic } from './runtime'
import { voiceDiagnosticMessage } from './diagnostics'
import type { VoiceServerControl } from '../../../../packages/contracts/src/ai/realtime-voice.transport'

type Task = Extract<VoiceServerControl, { type: 'task' }>
type VoiceContextValue = {
  active: boolean
  start: (target: CallTarget, onThread: (id: string) => void) => void
  call: RealtimeVoiceCall | null
  completed: CompletedVoiceCall[]
  command: RealtimeVoiceOptions['onCommand']
  mountSurface: () => () => void
}
const VoiceContext = createContext<VoiceContextValue | null>(null)

export function VoiceProvider({ children, onOpen }: { children: ReactNode; onOpen: (target: CallTarget) => void }) {
  const runtime = useRef<VoiceRuntime | null>(null)
  const activeRef = useRef(false)
  const callId = useRef('')
  const [surfaceCount, setSurfaceCount] = useState(0)
  const [startedAt, setStartedAt] = useState<string>()
  const [completed, setCompleted] = useState<CompletedVoiceCall[]>([])
  const [target, setTarget] = useState<CallTarget | null>(null)
  const [state, setState] = useState<VoiceState>('ended')
  const [diagnostic, setDiagnostic] = useState<VoiceDiagnostic>()
  const [muted, setMuted] = useState(false)
  const [caption, setCaption] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const active = state !== 'ended' && state !== 'error'
  useEffect(
    () => () => {
      runtime.current?.dispose()
      runtime.current = null
    },
    []
  )
  const start: VoiceContextValue['start'] = (next, onThread) => {
    if (activeRef.current) return
    runtime.current?.dispose()
    activeRef.current = true
    const id = (callId.current = crypto.randomUUID())
    setStartedAt(undefined)
    setTarget(next)
    setState('connecting')
    setDiagnostic(undefined)
    setMuted(false)
    setCaption('')
    setTasks([])
    const call = new VoiceRuntime(
      (nextState) => {
        if (callId.current !== id) return
        activeRef.current = nextState !== 'ended' && nextState !== 'error'
        setState(nextState)
      },
      (event) => {
        if (callId.current !== id) return
        if (event.type === 'ready') setStartedAt(new Date().toISOString())
        if (event.type === 'transcript') setCaption(event.text)
        if (event.type === 'task')
          setTasks((previous) => [event, ...previous.filter((task) => task.taskId !== event.taskId)].slice(0, 10))
      },
      (code) => {
        if (callId.current === id) setDiagnostic(code)
      },
      (result) => {
        if (result.call)
          setCompleted((previous) =>
            [...previous.filter((item) => item.id !== result.call!.id), result.call!].slice(-100)
          )
      }
    )
    runtime.current = call
    void call.start(next, (threadId, conversationId) => {
      setTarget({ ...next, threadId, conversationId })
      onThread(threadId)
    })
  }
  const stateLabel =
    state === 'connecting'
      ? t('Connecting voice…')
      : state === 'speaking'
        ? t('Speaking')
        : state === 'listening'
          ? muted
            ? t('Microphone muted')
            : t('Listening')
          : state === 'error'
            ? voiceDiagnosticMessage(diagnostic)
            : t('Call ended')
  const call: RealtimeVoiceCall | null = target
    ? {
        id: callId.current,
        assistantId: target.assistantId,
        threadId: target.threadId,
        name: target.name,
        state,
        muted,
        startedAt,
        caption,
        notice: diagnostic ? voiceDiagnosticMessage(diagnostic) : undefined,
        tasks: tasks.map((task) => ({
          id: task.taskId,
          text: task.text,
          pending: task.status === 'running' || task.status === 'queued',
          label:
            task.status === 'queued'
              ? t('Task accepted')
              : task.status === 'running'
                ? t('Task running')
                : task.status === 'completed'
                  ? task.action === 'steer'
                    ? t('Correction delivered')
                    : t('Task completed')
                  : task.status === 'canceled'
                    ? t('Task canceled')
                    : task.status === 'waiting'
                      ? t('Review required in conversation')
                      : task.status === 'unknown'
                        ? t('Task outcome unknown. Check conversation.')
                        : t('Task failed')
        }))
      }
    : null
  const command: RealtimeVoiceOptions['onCommand'] = (input) => {
    if (input.type === 'start' || input.callId !== callId.current) return
    if (input.type === 'mute') {
      runtime.current?.mute(input.muted)
      setMuted(input.muted)
    }
    if (input.type === 'interrupt') runtime.current?.interrupt()
    if (input.type === 'end') runtime.current?.close()
    if (input.type === 'dismiss' && !activeRef.current) setTarget(null)
    if (input.type === 'open' && target) onOpen(target)
  }
  const mountSurface = useMemo(
    () => () => {
      setSurfaceCount((count) => count + 1)
      return () => setSurfaceCount((count) => Math.max(0, count - 1))
    },
    []
  )
  return (
    <VoiceContext.Provider value={{ active, start, call, completed, command, mountSurface }}>
      {children}
      {target && surfaceCount === 0 && (
        <aside
          aria-label={t('Voice call')}
          className="fixed bottom-5 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl"
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ${state === 'speaking' ? 'animate-pulse' : ''}`}
            >
              <Mic className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{target.name}</p>
              <p role="status" className="text-xs text-muted-foreground">
                {stateLabel}
              </p>
            </div>
            {!active && (
              <Button variant="ghost" size="icon" aria-label={t('Close')} onClick={() => setTarget(null)}>
                <X className="size-4" />
              </Button>
            )}
          </div>
          {caption && (
            <p className="mt-3 max-h-28 overflow-y-auto text-sm" aria-live="off">
              {caption}
            </p>
          )}
          {active && diagnostic === 'playback_overflow' && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {voiceDiagnosticMessage(diagnostic)}
            </p>
          )}
          {tasks.length > 0 && (
            <div className="mt-3 max-h-36 space-y-2 overflow-y-auto border-t pt-3">
              {tasks.slice(0, 4).map((task) => (
                <div key={task.taskId} className="text-xs">
                  <span className="font-medium">
                    {task.status === 'queued'
                      ? t('Task accepted')
                      : task.status === 'running'
                        ? t('Task running')
                        : task.status === 'completed'
                          ? task.action === 'steer'
                            ? t('Correction delivered')
                            : t('Task completed')
                          : task.status === 'canceled'
                            ? t('Task canceled')
                            : task.status === 'waiting'
                              ? t('Review required in conversation')
                              : task.status === 'unknown'
                                ? t('Task outcome unknown. Check conversation.')
                                : t('Task failed')}
                  </span>
                  {task.text && <p className="mt-1 line-clamp-3 text-muted-foreground">{task.text}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            {active && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={muted ? t('Unmute microphone') : t('Mute microphone')}
                  aria-pressed={muted}
                  onClick={() => {
                    runtime.current?.mute(!muted)
                    setMuted(!muted)
                  }}
                >
                  {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('Interrupt speech')}
                  onClick={() => runtime.current?.interrupt()}
                >
                  <Square className="size-4" />
                </Button>
                <Button variant="destructive" size="sm" onClick={() => runtime.current?.close()}>
                  <PhoneOff className="mr-2 size-4" />
                  {t('Hang up')}
                </Button>
              </>
            )}
            {target.threadId && (
              <Button className="ml-auto" variant="ghost" size="sm" onClick={() => onOpen(target)}>
                {t('Open conversation')}
              </Button>
            )}
          </div>
          {!active && tasks.some((task) => task.status === 'running' || task.status === 'queued') && (
            <p className="mt-2 text-xs text-muted-foreground">{t('Accepted tasks continue after the call.')}</p>
          )}
        </aside>
      )}
    </VoiceContext.Provider>
  )
}

/** Audio remains at the app root while the embedded ChatKit renders its controls. */
export function useVoiceOptions(target: CallTarget, onThread: (id: string) => void): RealtimeVoiceOptions | undefined {
  const voice = useContext(VoiceContext)
  const [capability, setCapability] = useState<{ assistantId: string; enabled: boolean }>()
  const latest = useRef({ voice, target, onThread })
  latest.current = { voice, target, onThread }
  useEffect(() => voice?.mountSurface(), [voice?.mountSurface])
  useEffect(() => {
    let current = true
    void invoke('voiceCapability', target)
      .then((result) => {
        if (current) setCapability({ assistantId: target.assistantId, enabled: result.enabled })
      })
      .catch(() => {
        if (current) setCapability({ assistantId: target.assistantId, enabled: false })
      })
    return () => {
      current = false
    }
  }, [target.botId, target.assistantId])
  const onCommand = useMemo<RealtimeVoiceOptions['onCommand']>(
    () => (input) => {
      const { voice, target, onThread } = latest.current
      if (input.type === 'start') {
        if (input.assistantId !== target.assistantId || input.threadId !== target.threadId)
          throw new Error('Voice scope changed')
        voice?.start(target, onThread)
      } else return voice?.command(input)
    },
    []
  )
  return useMemo(
    () =>
      voice
        ? {
            enabled: capability?.assistantId === target.assistantId && capability.enabled,
            call: voice.call,
            completed: voice.completed,
            onCommand
          }
        : undefined,
    [capability, target.assistantId, voice, onCommand]
  )
}
