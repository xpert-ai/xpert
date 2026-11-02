// One visible page owns the SSE per authenticated scope. Peers receive invalidations only.
// Web Locks release automatically when an owning page closes or crashes.
export interface NotificationStreamEnvironment {
  locks: Pick<LockManager, 'request'>
  channel: (name: string) => Pick<BroadcastChannel, 'postMessage' | 'close' | 'onmessage'>
}

export function coordinateNotificationStream(
  identity: string,
  start: (publish: () => void) => () => void,
  invalidate: () => void,
  environment: NotificationStreamEnvironment = {
    locks: navigator.locks,
    channel: typeof BroadcastChannel === 'undefined' ? null : (name) => new BroadcastChannel(name)
  }
): () => void {
  // Polling remains available when cross-page coordination is unsupported.
  if (!environment.locks || !environment.channel) return () => undefined
  const name = `xpert:notification-stream:${identity}`
  let channel: ReturnType<NotificationStreamEnvironment['channel']>
  try {
    channel = environment.channel(name)
  } catch {
    return () => undefined
  }
  const controller = new AbortController()
  let active = true
  let stop: (() => void) | undefined
  let release: (() => void) | undefined
  const dispose = () => {
    if (!active) return
    active = false
    controller.abort()
    stop?.()
    release?.()
    channel.close()
  }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (active && event.data === 'invalidate') invalidate()
  }
  try {
    void environment.locks
      .request(name, { signal: controller.signal }, async () => {
        if (!active) return
        const held = new Promise<void>((resolve) => {
          release = resolve
        })
        stop = start(() => {
          if (active) channel.postMessage('invalidate')
        })
        await held
      })
      .catch(dispose)
  } catch {
    dispose()
  }
  return dispose
}
