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
