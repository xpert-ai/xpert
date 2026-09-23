import { startChatkitPanelResize } from './panel-resize'

function pointerEvent(type: string, clientX: number, pointerId = 1) {
  const event = new MouseEvent(type, { clientX, bubbles: true, cancelable: true })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  return event
}

describe('ChatKit panel resize', () => {
  let cleanup: (() => void) | undefined
  let handle: HTMLDivElement
  let onWidth: jest.Mock
  let onEnd: jest.Mock
  let onMaximize: jest.Mock

  beforeEach(() => {
    handle = document.createElement('div')
    document.body.append(handle)
    document.body.style.cursor = 'crosshair'
    document.body.style.userSelect = 'text'
    handle.setPointerCapture = jest.fn()
    handle.hasPointerCapture = jest.fn(() => true)
    handle.releasePointerCapture = jest.fn()
    onWidth = jest.fn()
    onEnd = jest.fn()
    onMaximize = jest.fn()
  })

  afterEach(() => {
    cleanup?.()
    handle.remove()
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  })

  function start(width = 460) {
    handle.addEventListener(
      'pointerdown',
      (event) => {
        cleanup = startChatkitPanelResize(event, width, { onWidth, onEnd, onMaximize })
      },
      { once: true }
    )
    handle.dispatchEvent(pointerEvent('pointerdown', 800))
  }

  it('maximizes immediately only after dragging more than half the minimum width beyond the border', () => {
    start()
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1)

    // 76px reaches the minimum width; another 192px reaches the exact threshold.
    for (const clientX of [876, 1067, 1068]) {
      window.dispatchEvent(pointerEvent('pointermove', clientX))
      expect(onWidth).toHaveBeenLastCalledWith(384)
      expect(onMaximize).not.toHaveBeenCalled()
      expect(onEnd).not.toHaveBeenCalled()
    }

    onMaximize.mockImplementation(() => {
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(document.body.style.cursor).toBe('crosshair')
      expect(document.body.style.userSelect).toBe('text')
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(1)
    })
    window.dispatchEvent(pointerEvent('pointermove', 1069))
    expect(onMaximize).toHaveBeenCalledTimes(1)

    window.dispatchEvent(pointerEvent('pointermove', 1100))
    window.dispatchEvent(pointerEvent('pointerup', 1100))
    cleanup?.()
    expect(onWidth).toHaveBeenCalledTimes(4)
    expect(onMaximize).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('uses the same threshold when starting at the minimum width', () => {
    start(384)
    window.dispatchEvent(pointerEvent('pointermove', 992))
    expect(onMaximize).not.toHaveBeenCalled()
    window.dispatchEvent(pointerEvent('pointermove', 993))
    expect(onMaximize).toHaveBeenCalledTimes(1)
  })

  it('allows reversing the drag below the threshold and still clamps the maximum width', () => {
    start()
    window.dispatchEvent(pointerEvent('pointermove', 1000))
    expect(onWidth).toHaveBeenLastCalledWith(384)
    window.dispatchEvent(pointerEvent('pointermove', 700))
    expect(onWidth).toHaveBeenLastCalledWith(560)
    window.dispatchEvent(pointerEvent('pointermove', -1000))
    expect(onWidth).toHaveBeenLastCalledWith(960)
    expect(onMaximize).not.toHaveBeenCalled()
  })

  it.each(['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'cleanup'])(
    'ends without maximizing on %s and removes listeners',
    (endType) => {
      start()
      window.dispatchEvent(pointerEvent('pointermove', 1000))
      if (endType === 'cleanup') cleanup?.()
      else if (endType === 'blur') window.dispatchEvent(new Event('blur'))
      else if (endType === 'lostpointercapture') handle.dispatchEvent(pointerEvent(endType, 1000))
      else window.dispatchEvent(pointerEvent(endType, 1000))

      window.dispatchEvent(pointerEvent('pointermove', 1200))
      expect(onMaximize).not.toHaveBeenCalled()
      expect(onWidth).toHaveBeenCalledTimes(1)
      expect(onEnd).toHaveBeenCalledTimes(1)
      expect(document.body.style.cursor).toBe('crosshair')
      expect(document.body.style.userSelect).toBe('text')
    }
  )

  it('ignores other pointers during an active drag', () => {
    start()
    window.dispatchEvent(pointerEvent('pointermove', 1200, 2))
    window.dispatchEvent(pointerEvent('pointerup', 1200, 2))
    window.dispatchEvent(pointerEvent('pointercancel', 1200, 2))
    expect(onWidth).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
    expect(onMaximize).not.toHaveBeenCalled()

    window.dispatchEvent(pointerEvent('pointermove', 700))
    expect(onWidth).toHaveBeenLastCalledWith(560)
  })
})
