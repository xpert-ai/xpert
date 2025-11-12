import { Directive, ElementRef, NgZone, OnDestroy, Renderer2, effect, signal } from '@angular/core'

@Directive({
  selector: '[ngmResizable]',
  standalone: true
})
export class NgmResizableDirective implements OnDestroy {
  private resizer!: HTMLElement
  private startX = 0
  private startY = 0
  private startWidth = 0
  private startHeight = 0

  // Reactive signals for width and height
  private width = signal<number | null>(null)
  private height = signal<number | null>(null)

  private mouseMoveListener!: (event: MouseEvent) => void
  private mouseUpListener!: () => void

  constructor(
    private el: ElementRef<HTMLElement>,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {
    this.createResizer()

    // Auto-apply width and height when signal values change
    effect(() => {
      const w = this.width()
      const h = this.height()

      if (w !== null) {
        this.renderer.setStyle(this.el.nativeElement, 'width', `${w}px`)
      }
      if (h !== null) {
        this.renderer.setStyle(this.el.nativeElement, 'height', `${h}px`)
      }
    })
  }

  /**
   * Create draggable handle at bottom-right corner
   */
  private createResizer(): void {
    this.resizer = this.renderer.createElement('div')
    this.renderer.setStyle(this.resizer, 'position', 'absolute')
    this.renderer.setStyle(this.resizer, 'display', 'flex')
    this.renderer.setStyle(this.resizer, 'justify-content', 'center')
    this.renderer.setStyle(this.resizer, 'align-items', 'center')
    this.renderer.setStyle(this.resizer, 'width', '16px')
    this.renderer.setStyle(this.resizer, 'height', '16px')
    this.renderer.setStyle(this.resizer, 'bottom', '2px')
    this.renderer.setStyle(this.resizer, 'right', '2px')
    this.renderer.setStyle(this.resizer, 'cursor', 'se-resize')
    this.renderer.setStyle(this.resizer, 'z-index', '10')
    this.renderer.setStyle(this.resizer, 'pointer-events', 'auto')
    this.renderer.setAttribute(this.resizer, 'class', 'ngm-resizer-handle')

    // Add icon inside the resizer div
    const icon = this.renderer.createElement('i')
    this.renderer.addClass(icon, 'ri-arrow-right-down-box-fill')
    this.renderer.appendChild(this.resizer, icon)

    const host = this.el.nativeElement
    this.renderer.setStyle(host, 'position', 'relative')
    this.renderer.appendChild(host, this.resizer)

    this.ngZone.runOutsideAngular(() => {
      this.resizer.addEventListener('mousedown', (event: MouseEvent) => {
        if (event.button === 0) { // Only respond to left mouse button
          this.initResize(event)
        }
      })
    })
  }

  /**
   * Start resizing on mousedown
   */
  private initResize = (event: MouseEvent): void => {
    event.preventDefault()
    const rect = this.el.nativeElement.getBoundingClientRect()

    this.startX = event.clientX
    this.startY = event.clientY
    this.startWidth = rect.width
    this.startHeight = rect.height

    this.mouseMoveListener = this.onMouseMove.bind(this)
    this.mouseUpListener = this.stopResize.bind(this)

    document.addEventListener('mousemove', this.mouseMoveListener)
    document.addEventListener('mouseup', this.mouseUpListener)
  }

  /**
   * Update signal values based on mouse movement
   */
  private onMouseMove(event: MouseEvent): void {
    const dx = event.clientX - this.startX
    const dy = event.clientY - this.startY

    const newWidth = Math.max(50, this.startWidth + dx)
    const newHeight = Math.max(50, this.startHeight + dy)

    // Update signals
    this.width.set(newWidth)
    this.height.set(newHeight)
  }

  /**
   * Stop resizing and clean up
   */
  private stopResize(): void {
    document.removeEventListener('mousemove', this.mouseMoveListener)
    document.removeEventListener('mouseup', this.mouseUpListener)
  }

  ngOnDestroy(): void {
    if (this.resizer) {
      this.resizer.removeEventListener('mousedown', this.initResize)
    }
  }
}
