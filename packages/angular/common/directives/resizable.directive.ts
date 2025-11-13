import { Directive, ElementRef, NgZone, OnDestroy, Renderer2, effect, input, signal } from '@angular/core'

export type ResizeDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'

/**
 * @directive NgmResizableDirective
 * 
 * Adds one or more resize handles (class .ngm-resize-handle) around the host element, allowing
 * interactive resizing from multiple directions.
 * 
 * Features:
 * - Uses Angular signals for width/height reactivity.
 * - `directions` input signal defines where handles appear.
 * - Width/height not modified until user resizes manually.
 * - Handles created dynamically per direction.
 * - Mouse events handled outside Angular zone for performance.
 */
@Directive({
  selector: '[ngmResizable]',
  standalone: true
})
export class NgmResizableDirective implements OnDestroy {
  private handles: HTMLElement[] = []
  private startX = 0
  private startY = 0
  private startWidth = 0
  private startHeight = 0
  private startLeft = 0
  private startTop = 0

  // Inputs
  /** Directions that define which edges or corners can be resized */
  readonly directions = input<ResizeDirection[]>(['bottomRight'])

  private width = signal<number | null>(null)
  private height = signal<number | null>(null)
  // private left = signal<number | null>(null)
  // private top = signal<number | null>(null)

  private activeDirection: ResizeDirection | null = null
  private mouseMoveListener!: (event: MouseEvent) => void
  private mouseUpListener!: () => void

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {
    this.renderer.setStyle(this.el.nativeElement, 'position', 'relative')

    // Reactively apply style updates when size signals change
    effect(() => {
      const w = this.width()
      const h = this.height()
      // const l = this.left()
      // const t = this.top()

      if (w !== null) this.renderer.setStyle(this.el.nativeElement, 'width', `${w}px`)
      if (h !== null) this.renderer.setStyle(this.el.nativeElement, 'height', `${h}px`)
      // if (l !== null) this.renderer.setStyle(this.el.nativeElement, 'left', `${l}px`)
      // if (t !== null) this.renderer.setStyle(this.el.nativeElement, 'top', `${t}px`)
    })

    // Recreate handles when directions signal changes
    effect(() => {
      this.clearHandles()
      const dirs = this.directions()
      dirs.forEach((dir) => this.createHandle(dir))
    })
  }

  /**
   * Create one handle for a specific resize direction with visual style
   */
  private createHandle(direction: ResizeDirection): void {
    const handle = this.renderer.createElement('div')
    this.renderer.addClass(handle, 'ngm-resize-handle')
    this.renderer.setStyle(handle, 'position', 'absolute')
    this.renderer.setStyle(handle, 'z-index', '10')
    this.renderer.setStyle(handle, 'pointer-events', 'auto')
    this.renderer.setStyle(handle, 'display', 'flex')
    this.renderer.setStyle(handle, 'justify-content', 'center')
    this.renderer.setStyle(handle, 'align-items', 'center')
    this.renderer.setStyle(handle, 'cursor', this.getCursor(direction))

    const pos = this.getHandlePosition(direction)
    for (const [key, value] of Object.entries(pos)) {
      this.renderer.setStyle(handle, key, value)
    }

    // === Visual style by direction ===
    if (['left', 'right'].includes(direction)) {
      // Vertical edge handle
      this.renderer.setStyle(handle, 'width', '6px')
      this.renderer.setStyle(handle, 'height', '20px')
      this.renderer.setStyle(handle, 'border-radius', '3px')
      this.renderer.setStyle(handle, 'top', '50%')
      this.renderer.setStyle(handle, 'transform', 'translateY(-50%)')
      this.renderer.setStyle(handle, 'background', 'rgba(0,0,0,0.05)')
      this.renderer.setStyle(handle, 'transition', 'background 0.2s')
      this.renderer.listen(handle, 'mouseenter', () =>
        this.renderer.setStyle(handle, 'background', 'rgba(0,0,0,0.15)')
      )
      this.renderer.listen(handle, 'mouseleave', () =>
        this.renderer.setStyle(handle, 'background', 'rgba(0,0,0,0.05)')
      )
    } else if (['top', 'bottom'].includes(direction)) {
      // Horizontal edge handle
      this.renderer.setStyle(handle, 'height', '6px')
      this.renderer.setStyle(handle, 'width', '20px')
      this.renderer.setStyle(handle, 'border-radius', '3px')
      this.renderer.setStyle(handle, 'left', '50%')
      this.renderer.setStyle(handle, 'transform', 'translateX(-50%)')
      this.renderer.setStyle(handle, 'background', 'rgba(0,0,0,0.05)')
      this.renderer.setStyle(handle, 'transition', 'background 0.2s')
      this.renderer.listen(handle, 'mouseenter', () =>
        this.renderer.setStyle(handle, 'background', 'rgba(0,0,0,0.15)')
      )
      this.renderer.listen(handle, 'mouseleave', () =>
        this.renderer.setStyle(handle, 'background', 'rgba(0,0,0,0.05)')
      )
    } else {
      // Corner handles (L-shape using two small bars)
      this.renderer.setStyle(handle, 'width', '14px')
      this.renderer.setStyle(handle, 'height', '14px')
      this.renderer.setStyle(handle, 'background', 'transparent')

      const bar1 = this.renderer.createElement('div')
      const bar2 = this.renderer.createElement('div')

      // Common bar style
      const applyBarStyle = (bar: HTMLElement) => {
        this.renderer.setStyle(bar, 'background', 'rgba(0,0,0,0.3)')
        this.renderer.setStyle(bar, 'position', 'absolute')
        this.renderer.setStyle(bar, 'border-radius', '1px')
        this.renderer.setStyle(bar, 'transition', 'background 0.2s')
      }
      applyBarStyle(bar1)
      applyBarStyle(bar2)

      // Position bars based on direction
      switch (direction) {
        case 'bottomRight':
          this.renderer.setStyle(bar1, 'bottom', '2px')
          this.renderer.setStyle(bar1, 'left', '3px')
          this.renderer.setStyle(bar1, 'width', '9px')
          this.renderer.setStyle(bar1, 'height', '3px')

          this.renderer.setStyle(bar2, 'right', '2px')
          this.renderer.setStyle(bar2, 'top', '3px')
          this.renderer.setStyle(bar2, 'width', '3px')
          this.renderer.setStyle(bar2, 'height', '9px')
          break

        case 'bottomLeft':
          this.renderer.setStyle(bar1, 'bottom', '2px')
          this.renderer.setStyle(bar1, 'right', '3px')
          this.renderer.setStyle(bar1, 'width', '9px')
          this.renderer.setStyle(bar1, 'height', '3px')

          this.renderer.setStyle(bar2, 'left', '2px')
          this.renderer.setStyle(bar2, 'top', '3px')
          this.renderer.setStyle(bar2, 'width', '3px')
          this.renderer.setStyle(bar2, 'height', '9px')
          break

        case 'topRight':
          this.renderer.setStyle(bar1, 'top', '2px')
          this.renderer.setStyle(bar1, 'left', '3px')
          this.renderer.setStyle(bar1, 'width', '9px')
          this.renderer.setStyle(bar1, 'height', '2px')

          this.renderer.setStyle(bar2, 'bottom', '2px')
          this.renderer.setStyle(bar2, 'right', '3px')
          this.renderer.setStyle(bar2, 'width', '3px')
          this.renderer.setStyle(bar2, 'height', '9px')
          break

        case 'topLeft':
          this.renderer.setStyle(bar1, 'top', '2px')
          this.renderer.setStyle(bar1, 'right', '3px')
          this.renderer.setStyle(bar1, 'width', '9px')
          this.renderer.setStyle(bar1, 'height', '3px')

          this.renderer.setStyle(bar2, 'bottom', '2px')
          this.renderer.setStyle(bar2, 'left', '3px')
          this.renderer.setStyle(bar2, 'width', '3px')
          this.renderer.setStyle(bar2, 'height', '9px')
          break
      }

      this.renderer.appendChild(handle, bar1)
      this.renderer.appendChild(handle, bar2)

      // Hover effect for corner handles
      this.renderer.listen(handle, 'mouseenter', () => {
        this.renderer.setStyle(bar1, 'background', 'rgba(0,0,0,0.6)')
        this.renderer.setStyle(bar2, 'background', 'rgba(0,0,0,0.6)')
      })
      this.renderer.listen(handle, 'mouseleave', () => {
        this.renderer.setStyle(bar1, 'background', 'rgba(0,0,0,0.3)')
        this.renderer.setStyle(bar2, 'background', 'rgba(0,0,0,0.3)')
      })
    }

    this.renderer.appendChild(this.el.nativeElement, handle)
    this.handles.push(handle)

    // Attach resize event outside Angular zone
    this.ngZone.runOutsideAngular(() => {
      handle.addEventListener('mousedown', (event: MouseEvent) => {
        if (event.button === 0) {
          this.activeDirection = direction
          this.initResize(event)
        }
      })
    })
  }

  /**
   * Initialize resizing
   */
  private initResize(event: MouseEvent): void {
    event.preventDefault()

    const rect = this.el.nativeElement.getBoundingClientRect()
    const computedStyle = window.getComputedStyle(this.el.nativeElement)

    this.startX = event.clientX
    this.startY = event.clientY
    this.startWidth = rect.width
    this.startHeight = rect.height
    this.startLeft = parseFloat(computedStyle.left || '0')
    this.startTop = parseFloat(computedStyle.top || '0')

    this.mouseMoveListener = this.onMouseMove.bind(this)
    this.mouseUpListener = this.stopResize.bind(this)

    document.addEventListener('mousemove', this.mouseMoveListener)
    document.addEventListener('mouseup', this.mouseUpListener)
  }

  /**
   * Adjust size and position based on active direction
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.activeDirection) return

    const dx = event.clientX - this.startX
    const dy = event.clientY - this.startY

    let newWidth = this.startWidth
    let newHeight = this.startHeight
    // let newLeft = this.startLeft
    // let newTop = this.startTop

    switch (this.activeDirection) {
      case 'right':
        newWidth = Math.max(50, this.startWidth + dx)
        break
      case 'bottom':
        newHeight = Math.max(50, this.startHeight + dy)
        break
      case 'bottomRight':
        newWidth = Math.max(50, this.startWidth + dx)
        newHeight = Math.max(50, this.startHeight + dy)
        break
      case 'left':
        newWidth = Math.max(50, this.startWidth - dx)
        // newLeft = this.startLeft + dx
        break
      case 'top':
        newHeight = Math.max(50, this.startHeight - dy)
        // newTop = this.startTop + dy
        break
      case 'topLeft':
        newWidth = Math.max(50, this.startWidth - dx)
        newHeight = Math.max(50, this.startHeight - dy)
        // newLeft = this.startLeft + dx
        // newTop = this.startTop + dy
        break
      case 'topRight':
        newWidth = Math.max(50, this.startWidth + dx)
        newHeight = Math.max(50, this.startHeight - dy)
        // newTop = this.startTop + dy
        break
      case 'bottomLeft':
        newWidth = Math.max(50, this.startWidth - dx)
        newHeight = Math.max(50, this.startHeight + dy)
        // newLeft = this.startLeft + dx
        break
    }

    this.width.set(newWidth)
    this.height.set(newHeight)
    // this.left.set(newLeft)
    // this.top.set(newTop)
  }

  private stopResize(): void {
    this.activeDirection = null
    document.removeEventListener('mousemove', this.mouseMoveListener)
    document.removeEventListener('mouseup', this.mouseUpListener)
  }

  private clearHandles(): void {
    this.handles.forEach((h) => this.renderer.removeChild(this.el.nativeElement, h))
    this.handles = []
  }

  ngOnDestroy(): void {
    this.clearHandles()
  }

  // === helpers ===

  private getCursor(direction: ResizeDirection): string {
    const map: Record<ResizeDirection, string> = {
      left: 'w-resize',
      right: 'e-resize',
      top: 'n-resize',
      bottom: 's-resize',
      topLeft: 'nw-resize',
      topRight: 'ne-resize',
      bottomLeft: 'sw-resize',
      bottomRight: 'se-resize'
    }
    return map[direction]
  }

  private getHandlePosition(direction: ResizeDirection): Record<string, string> {
    const base = { top: 'auto', bottom: 'auto', left: 'auto', right: 'auto' }

    switch (direction) {
      case 'right':
        return { ...base, right: '0', top: '50%', transform: 'translateY(-50%)' }
      case 'bottom':
        return { ...base, bottom: '0', left: '50%', transform: 'translateX(-50%)' }
      case 'bottomRight':
        return { ...base, bottom: '0', right: '0' }
      case 'left':
        return { ...base, left: '0', top: '50%', transform: 'translateY(-50%)' }
      case 'top':
        return { ...base, top: '0', left: '50%', transform: 'translateX(-50%)' }
      case 'topLeft':
        return { ...base, top: '0', left: '0' }
      case 'topRight':
        return { ...base, top: '0', right: '0' }
      case 'bottomLeft':
        return { ...base, bottom: '0', left: '0' }
      default:
        return base
    }
  }
}