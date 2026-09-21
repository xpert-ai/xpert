import { CLAWXPERT_CHATKIT_MIN_WIDTH_PX, CLAWXPERT_CHATKIT_MAX_WIDTH_PX } from './layout'

const CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE = 'data-chatkit-overlay-drag-bar'

const CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE = 'data-chatkit-overlay-resize-handle'

const CHATKIT_OVERLAY_CONTROLS_STYLE_ATTRIBUTE = 'data-chatkit-overlay-controls-style'

const CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX = 8

const CLAWXPERT_OVERLAY_MIN_TOP_PX = 16

export function installChatkitOverlayDialogControls(
  chatkitElement: HTMLElement,
  options: { moveLabel: string; resizeLabel: string }
) {
  const shadowRoot = chatkitElement.shadowRoot
  const wrapper = shadowRoot?.querySelector<HTMLElement>('.ck-wrapper')
  const launcherCloseButton = wrapper?.querySelector<HTMLElement>('.ck-launcher-close') ?? null
  const ownerDocument = chatkitElement.ownerDocument
  const ownerWindow = ownerDocument.defaultView

  if (!shadowRoot || !wrapper || !ownerWindow || !ownerDocument.body) {
    return null
  }

  shadowRoot.querySelector(`[${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]`)?.remove()
  shadowRoot.querySelector(`[${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]`)?.remove()
  shadowRoot.querySelector(`[${CHATKIT_OVERLAY_CONTROLS_STYLE_ATTRIBUTE}]`)?.remove()

  const previousCloseButtonDisplay = launcherCloseButton?.style.getPropertyValue('display') ?? ''
  const previousCloseButtonDisplayPriority = launcherCloseButton?.style.getPropertyPriority('display') ?? ''
  const previousCloseButtonAriaHidden = launcherCloseButton?.getAttribute('aria-hidden') ?? null
  const previousCloseButtonTabIndex = launcherCloseButton?.getAttribute('tabindex') ?? null
  launcherCloseButton?.style.setProperty('display', 'none', 'important')
  launcherCloseButton?.setAttribute('aria-hidden', 'true')
  launcherCloseButton?.setAttribute('tabindex', '-1')

  const controlsStyle = ownerDocument.createElement('style')
  controlsStyle.setAttribute(CHATKIT_OVERLAY_CONTROLS_STYLE_ATTRIBUTE, '')
  controlsStyle.textContent = `
    .ck-launcher-close {
      display: none !important;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}] {
      position: absolute;
      top: 1px;
      right: 1px;
      left: 1px;
      z-index: 3;
      height: 18px;
      border: 0;
      border-radius: 17px 17px 0 0;
      background: transparent;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: linear-gradient(
        180deg,
        color-mix(in oklab, var(--sys-border-strong) 72%, transparent) 0%,
        color-mix(in oklab, var(--sys-surface-elevated) 36%, transparent) 52%,
        transparent 100%
      );
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms ease;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]:hover::after,
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]:focus-visible::after,
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}][data-dragging='true']::after {
      opacity: 1;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}]:focus-visible {
      outline: none;
    }
    [${CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE}][data-dragging='true'] {
      cursor: grabbing;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}] {
      position: absolute;
      top: 8px;
      bottom: 8px;
      left: -7px;
      z-index: 3;
      width: 14px;
      border-radius: 999px;
      cursor: ew-resize;
      touch-action: none;
      user-select: none;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]::after {
      content: '';
      position: absolute;
      top: 50%;
      bottom: auto;
      left: 5px;
      width: 3px;
      height: 44px;
      border-radius: 999px;
      background: color-mix(in oklab, var(--sys-text-secondary) 58%, transparent);
      opacity: 0;
      transform: translateY(-50%);
      transition: opacity 120ms ease;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]:hover::after,
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]:focus-visible::after,
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}][data-resizing='true']::after {
      opacity: 1;
    }
    [${CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE}]:focus-visible {
      outline: 2px solid color-mix(in oklab, var(--sys-primary) 70%, transparent);
      outline-offset: -2px;
    }
  `

  const dragBar = ownerDocument.createElement('div')
  dragBar.setAttribute(CHATKIT_OVERLAY_DRAG_BAR_ATTRIBUTE, '')
  dragBar.setAttribute('aria-label', options.moveLabel)
  dragBar.title = options.moveLabel
  dragBar.tabIndex = 0

  const resizeHandle = ownerDocument.createElement('div')
  resizeHandle.setAttribute(CHATKIT_OVERLAY_RESIZE_HANDLE_ATTRIBUTE, '')
  resizeHandle.setAttribute('role', 'separator')
  resizeHandle.setAttribute('aria-orientation', 'vertical')
  resizeHandle.setAttribute('aria-label', options.resizeLabel)
  resizeHandle.setAttribute('aria-valuemin', `${CLAWXPERT_CHATKIT_MIN_WIDTH_PX}`)
  resizeHandle.setAttribute('aria-valuemax', `${CLAWXPERT_CHATKIT_MAX_WIDTH_PX}`)
  resizeHandle.title = options.resizeLabel
  resizeHandle.tabIndex = 0

  shadowRoot.appendChild(controlsStyle)
  wrapper.append(dragBar, resizeHandle)

  let activeInteractionCleanup: (() => void) | null = null

  const stopActiveInteraction = () => {
    activeInteractionCleanup?.()
    activeInteractionCleanup = null
  }

  const startPointerInteraction = (
    event: PointerEvent,
    cursor: string,
    onMove: (moveEvent: PointerEvent) => void,
    activeAttribute: 'data-dragging' | 'data-resizing',
    target: HTMLElement
  ) => {
    if (event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    stopActiveInteraction()

    const previousCursor = ownerDocument.body.style.cursor
    const previousUserSelect = ownerDocument.body.style.userSelect
    const pointerId = event.pointerId

    if (typeof pointerId === 'number' && typeof target.setPointerCapture === 'function') {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // Pointer capture is optional; window listeners keep the interaction active over the iframe.
      }
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (typeof pointerId === 'number' && moveEvent.pointerId !== pointerId) {
        return
      }
      moveEvent.preventDefault()
      onMove(moveEvent)
    }

    const finishInteraction = () => {
      cleanupInteraction()
    }

    const cleanupInteraction = () => {
      ownerWindow.removeEventListener('pointermove', handlePointerMove)
      ownerWindow.removeEventListener('pointerup', finishInteraction)
      ownerWindow.removeEventListener('pointercancel', finishInteraction)
      ownerDocument.body.style.cursor = previousCursor
      ownerDocument.body.style.userSelect = previousUserSelect
      target.removeAttribute(activeAttribute)
      if (activeInteractionCleanup === cleanupInteraction) {
        activeInteractionCleanup = null
      }
    }

    ownerDocument.body.style.cursor = cursor
    ownerDocument.body.style.userSelect = 'none'
    target.setAttribute(activeAttribute, 'true')
    ownerWindow.addEventListener('pointermove', handlePointerMove)
    ownerWindow.addEventListener('pointerup', finishInteraction, { once: true })
    ownerWindow.addEventListener('pointercancel', finishInteraction, { once: true })
    activeInteractionCleanup = cleanupInteraction
  }

  const moveOverlayDialog = (left: number, top: number, width: number, height: number) => {
    const maxLeft = Math.max(
      CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX,
      ownerWindow.innerWidth - width - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX
    )
    const maxTop = Math.max(
      CLAWXPERT_OVERLAY_MIN_TOP_PX,
      ownerWindow.innerHeight - height - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX
    )

    wrapper.style.left = `${Math.round(clampNumber(left, CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX, maxLeft))}px`
    wrapper.style.top = `${Math.round(clampNumber(top, CLAWXPERT_OVERLAY_MIN_TOP_PX, maxTop))}px`
    wrapper.style.right = 'auto'
    wrapper.style.bottom = 'auto'
  }

  const resizeOverlayDialog = (right: number, desiredWidth: number) => {
    const rightEdge = clampNumber(
      right,
      CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX,
      Math.max(CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX, ownerWindow.innerWidth - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX)
    )
    const maxWidth = Math.max(
      0,
      Math.min(
        CLAWXPERT_CHATKIT_MAX_WIDTH_PX,
        ownerWindow.innerWidth - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX * 2,
        rightEdge - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX
      )
    )
    const minWidth = Math.min(CLAWXPERT_CHATKIT_MIN_WIDTH_PX, maxWidth)
    const width = Math.round(clampNumber(desiredWidth, minWidth, maxWidth))

    wrapper.style.left = `${Math.round(rightEdge - width)}px`
    wrapper.style.right = 'auto'
    wrapper.style.width = `${width}px`
    resizeHandle.setAttribute('aria-valuenow', `${width}`)
  }

  const handleDragPointerDown = (event: PointerEvent) => {
    const rect = wrapper.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY

    startPointerInteraction(
      event,
      'grabbing',
      (moveEvent) => {
        moveOverlayDialog(
          rect.left + moveEvent.clientX - startX,
          rect.top + moveEvent.clientY - startY,
          rect.width,
          rect.height
        )
      },
      'data-dragging',
      dragBar
    )
  }

  const handleResizePointerDown = (event: PointerEvent) => {
    const rect = wrapper.getBoundingClientRect()
    const startX = event.clientX

    startPointerInteraction(
      event,
      'ew-resize',
      (moveEvent) => {
        resizeOverlayDialog(rect.right, rect.width + startX - moveEvent.clientX)
      },
      'data-resizing',
      resizeHandle
    )
  }

  const handleDragKeydown = (event: KeyboardEvent) => {
    const direction =
      event.key === 'ArrowLeft'
        ? { x: -1, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: 1, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -1 }
            : event.key === 'ArrowDown'
              ? { x: 0, y: 1 }
              : null
    if (!direction) {
      return
    }

    event.preventDefault()
    const rect = wrapper.getBoundingClientRect()
    const step = event.shiftKey ? 64 : 24
    moveOverlayDialog(rect.left + direction.x * step, rect.top + direction.y * step, rect.width, rect.height)
  }

  const handleResizeKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }

    event.preventDefault()
    const rect = wrapper.getBoundingClientRect()
    resizeOverlayDialog(rect.right, rect.width + (event.key === 'ArrowLeft' ? 32 : -32))
  }

  const constrainOverlayDialogToViewport = () => {
    if (!wrapper.style.left && !wrapper.style.top && !wrapper.style.width) {
      return
    }

    const rect = wrapper.getBoundingClientRect()
    const rightEdge = Math.min(rect.right, ownerWindow.innerWidth - CLAWXPERT_OVERLAY_VIEWPORT_GUTTER_PX)
    resizeOverlayDialog(rightEdge, rect.width)
    moveOverlayDialog(
      Number.parseFloat(wrapper.style.left),
      rect.top,
      Number.parseFloat(wrapper.style.width),
      rect.height
    )
  }

  dragBar.addEventListener('pointerdown', handleDragPointerDown)
  dragBar.addEventListener('keydown', handleDragKeydown)
  resizeHandle.addEventListener('pointerdown', handleResizePointerDown)
  resizeHandle.addEventListener('keydown', handleResizeKeydown)
  ownerWindow.addEventListener('resize', constrainOverlayDialogToViewport)

  const initialWidth = Math.round(wrapper.getBoundingClientRect().width)
  if (initialWidth > 0) {
    resizeHandle.setAttribute('aria-valuenow', `${initialWidth}`)
  }

  return () => {
    stopActiveInteraction()
    dragBar.removeEventListener('pointerdown', handleDragPointerDown)
    dragBar.removeEventListener('keydown', handleDragKeydown)
    resizeHandle.removeEventListener('pointerdown', handleResizePointerDown)
    resizeHandle.removeEventListener('keydown', handleResizeKeydown)
    ownerWindow.removeEventListener('resize', constrainOverlayDialogToViewport)
    dragBar.remove()
    resizeHandle.remove()
    controlsStyle.remove()
    if (launcherCloseButton) {
      if (previousCloseButtonDisplay) {
        launcherCloseButton.style.setProperty('display', previousCloseButtonDisplay, previousCloseButtonDisplayPriority)
      } else {
        launcherCloseButton.style.removeProperty('display')
      }
      restoreOptionalAttribute(launcherCloseButton, 'aria-hidden', previousCloseButtonAriaHidden)
      restoreOptionalAttribute(launcherCloseButton, 'tabindex', previousCloseButtonTabIndex)
    }
    wrapper.style.removeProperty('left')
    wrapper.style.removeProperty('top')
    wrapper.style.removeProperty('right')
    wrapper.style.removeProperty('bottom')
    wrapper.style.removeProperty('width')
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function restoreOptionalAttribute(element: HTMLElement, name: string, value: string | null) {
  if (value === null) {
    element.removeAttribute(name)
  } else {
    element.setAttribute(name, value)
  }
}
