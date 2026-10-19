import type { XpertHostLifecycleMessage } from '@xpert-ai/contracts'

type ActivationBridge = { onWindowActivated?: (listener: () => void) => () => void }
type PageVisibility = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>

export function subscribeAppActivation(
  callback: () => void,
  bridge: ActivationBridge | undefined = window.xpertDesktop,
  page: PageVisibility = document
) {
  if (bridge?.onWindowActivated) return bridge.onWindowActivated(callback)
  // Browser previews and older hosts refresh on tab restore, never on iframe focus transitions.
  let hidden = page.visibilityState === 'hidden'
  const visibility = () => {
    const visible = page.visibilityState === 'visible'
    const restored = hidden && visible
    hidden = !visible
    if (restored) callback()
  }
  page.addEventListener('visibilitychange', visibility)
  return () => page.removeEventListener('visibilitychange', visibility)
}
export function notifyEmbeddedAppActivation(host: Window = window) {
  const message: XpertHostLifecycleMessage = {
    channel: 'xpertai.host_lifecycle',
    protocolVersion: 1,
    type: 'activated'
  }
  const notify = (parent: Window) => {
    for (let index = 0; index < parent.frames.length; index++) {
      try {
        const frame = parent.frames[index]
        // Opaque remote Views cannot receive a same-origin target. No credentials or scope travel here.
        frame.postMessage(message, '*')
        notify(frame)
      } catch {
        // A frame may navigate or close during native activation.
      }
    }
  }
  notify(host)
}
