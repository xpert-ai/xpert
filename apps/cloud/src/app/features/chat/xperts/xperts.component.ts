import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { ConnectedPosition, Overlay, OverlayPositionBuilder } from '@angular/cdk/overlay'
import { TemplatePortal } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { Store } from '@metad/cloud/state'
import { OverlayAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService } from 'ngx-permissions'
import { map } from 'rxjs'
import { AIPermissionsEnum, IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { XpertCardComponent } from '../../../@shared/xpert'
import { ChatHomeService } from '../home.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkListboxModule,
    DragDropModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    XpertCardComponent
  ],
  selector: 'pac-chat-xperts',
  templateUrl: './xperts.component.html',
  styleUrl: 'xperts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [OverlayAnimations]
})
export class ChatXpertsComponent {
  readonly chatService = inject(ChatHomeService)
  readonly permissionsService = inject(NgxPermissionsService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly overlay = inject(Overlay)
  readonly positionBuilder = inject(OverlayPositionBuilder)
  readonly elementRef = inject(ElementRef)
  readonly viewContainerRef = inject(ViewContainerRef)

  // Chilrdren
  readonly xpertCard = viewChild('xpertCard', { read: TemplateRef })

  readonly pageSize = signal(10)
  readonly pageNo = signal(1)

  readonly xperts = computed(() => {
    const xperts = this.chatService.sortedXperts()
    return xperts?.slice(0, this.pageNo() * this.pageSize())
  })

  readonly hasMore = computed(() => {
    const totalXperts = this.chatService.xperts()?.length
    return totalXperts > this.pageNo() * this.pageSize()
  })

  readonly hasEditXpertPermission = toSignal(
    this.permissionsService.permissions$.pipe(map((permissions) => !!permissions[AIPermissionsEnum.XPERT_EDIT]))
  )

  // private overlayRef: OverlayRef
  private detachTimeoutId: any
  readonly xpert = signal<IXpert>(null)
  readonly element = signal<HTMLDivElement>(null)

  readonly portal = computed(() => {
    const xpert = this.xpert()
    if (xpert) {
      return new TemplatePortal(this.xpertCard(), this.viewContainerRef, { xpert })
    }
    return null
  })

  readonly overlayRef = computed(() => {
    const targetElement: HTMLDivElement = this.element()
    const containerElement = this.elementRef.nativeElement as HTMLElement

    if (!targetElement || !containerElement) {
      return null
    }

    const targetRect = targetElement.getBoundingClientRect()
    const containerRect = containerElement.getBoundingClientRect()

    // 相对于 elementRef 的偏移
    const offsetX = targetRect.left + targetRect.width / 2 - (containerRect.left + containerRect.width / 2)
    const offsetY = targetRect.top - containerRect.top

    // 判断 divElement 是在 elementRef 的上方还是下方
    const isAbove = true
    const isLeft = offsetX < 0

    const position = {
      originX: 'center' as const,
      originY: isAbove ? 'top' : ('bottom' as const),
      overlayX: 'center' as const,
      overlayY: isAbove ? 'bottom' : ('top' as const),
      offsetX: offsetX, // 水平方向偏移
      offsetY: offsetY - 8 // 垂直方向偏移
    } as ConnectedPosition

    return this.overlay.create({
      positionStrategy: this.positionBuilder.flexibleConnectedTo(this.elementRef).withPositions([position]),
      scrollStrategy: this.overlay.scrollStrategies.close()
    })
  })

  readonly hoverTooltip = signal(false)

  constructor() {
    effect(() => {
      // console.log(this.portal(), this.overlayRef())
    })

    effect(() => {
      const portal = this.portal()
      if (this.overlayRef() && portal) {
        this.overlayRef().attach(portal)
      }
    })

    effect(() => {
      if (!this.hoverTooltip()) {
        this.overlayRef()?.detach()
        this.element.set(null)
      }
    }, { allowSignalWrites: true })
  }

  showMore() {
    this.pageNo.update((state) => state + 1)
  }

  showLess() {
    this.pageNo.set(1)
  }

  selectXpert(xpert: IXpert) {
    this.#router.navigate(['/chat/x/', xpert.slug])
    this.chatService.conversationId.set(null)
  }

  dropSort(event: CdkDragDrop<IXpert[]>) {
    const xperts = this.chatService.sortedXperts().map(({ id }) => id)
    moveItemInArray(xperts, event.previousIndex, event.currentIndex)
    this.#store.updateXpert({ sortOrder: xperts })
  }

  showTooltip(xpert: IXpert, event: HTMLDivElement) {
    this.hoverTooltip.set(true)
    if (this.detachTimeoutId) {
      clearTimeout(this.detachTimeoutId)
      this.detachTimeoutId = null
    }
    this.overlayRef()?.detach()
    this.xpert.set(xpert)
    this.element.set(event)
  }

  hideTooltip() {
    this.detachTimeoutId = setTimeout(() => {
      this.hoverTooltip.set(false)
    }, 300)
  }

  mouseenterTooltip() {
    if (this.detachTimeoutId) {
      clearTimeout(this.detachTimeoutId)
      this.detachTimeoutId = null
    }
    this.hoverTooltip.set(true)
  }
}
