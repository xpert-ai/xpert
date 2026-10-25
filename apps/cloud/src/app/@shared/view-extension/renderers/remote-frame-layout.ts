export function getAvailableFrameHeight(frame?: HTMLIFrameElement, fillAvailableHeight = false) {
  if (typeof window === 'undefined') {
    return 720
  }
  const viewportHeight = Math.floor(window.visualViewport?.height ?? window.innerHeight ?? 720)
  const frameTop = frame ? Math.max(0, frame.getBoundingClientRect().top) : 0
  if (fillAvailableHeight && frame) {
    const hostOutletBottom = frame.closest('xp-extension-host-outlet')?.getBoundingClientRect().bottom
    const boundaryBottom =
      typeof hostOutletBottom === 'number' && Number.isFinite(hostOutletBottom)
        ? Math.min(viewportHeight, Math.max(frameTop, hostOutletBottom))
        : viewportHeight - 24

    return Math.max(520, Math.floor(boundaryBottom - frameTop))
  }

  return Math.max(520, viewportHeight - frameTop - 24)
}
