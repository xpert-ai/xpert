import { ConnectedPosition, Overlay, OverlayPositionBuilder, OverlayRef } from '@angular/cdk/overlay'
import { TemplatePortal } from '@angular/cdk/portal'
import { DestroyRef, Directive, effect, ElementRef, HostListener, inject, input, TemplateRef, ViewContainerRef } from '@angular/core'

@Directive({
  selector: '[ngmTooltip]',
  standalone: true
})
export class NgmTooltipDirective {
  readonly destroyRef = inject(DestroyRef);

  // Inputs
  readonly ngmTooltip = input<TemplateRef<any>>()
  readonly ngmTooltipContext = input<any>()
//   readonly showDelay = input<number>()
  readonly hideDelay = input<number>()
  readonly ngmTooltipPositions = input<ConnectedPosition[]>()

  private overlayRef: OverlayRef

//   private attachTimeoutId: any
  private detachTimeoutId: any

  // register a destroy callback
  readonly unregisterFn = this.destroyRef.onDestroy(() => {
    clearTimeout(this.detachTimeoutId) // 确保组件销毁时清理计时器
    this.overlayRef.dispose()
  })

  constructor(
    private overlay: Overlay,
    private elementRef: ElementRef,
    private positionBuilder: OverlayPositionBuilder,
    private viewContainerRef: ViewContainerRef
  ) {
    effect(() => {
      this.overlayRef?.dispose()
      this.overlayRef = this.overlay.create({
        positionStrategy: this.positionBuilder.flexibleConnectedTo(this.elementRef).withPositions(this.ngmTooltipPositions() ?? [
          {
            originX: 'center',
            originY: 'bottom',
            overlayX: 'center',
            overlayY: 'top',
            offsetY: 8
          }
        ]),
        scrollStrategy: this.overlay.scrollStrategies.close()
      })
    })
  }

  @HostListener('mouseenter')
  show() {
    if (this.ngmTooltip()) {
      if (this.detachTimeoutId) {
        clearTimeout(this.detachTimeoutId) // 防止 mouseenter 时清理正在进行的 detach 计时器
        this.detachTimeoutId = null
      }

      this.overlayRef.detach()
      const portal = new TemplatePortal(this.ngmTooltip(), this.viewContainerRef, this.ngmTooltipContext())
      this.overlayRef.attach(portal)
    }
  }

  @HostListener('mouseleave')
  hide() {
    this.detachTimeoutId = setTimeout(() => {
      this.overlayRef.detach()
    }, this.hideDelay() ?? 0)
  }
}
