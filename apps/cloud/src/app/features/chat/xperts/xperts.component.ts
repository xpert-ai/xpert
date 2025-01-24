import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { injectXpertPreferences, Store } from '@metad/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService } from 'ngx-permissions'
import { map } from 'rxjs'
import { AIPermissionsEnum, IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
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
    EmojiAvatarComponent
  ],
  selector: 'pac-chat-xperts',
  templateUrl: './xperts.component.html',
  styleUrl: 'xperts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatXpertsComponent {
  readonly chatService = inject(ChatHomeService)
  readonly permissionsService = inject(NgxPermissionsService)
  readonly #preferences = injectXpertPreferences()
  readonly #store = inject(Store)
  readonly #router = inject(Router)

  readonly sortOrder = computed(() => this.#preferences()?.sortOrder)
  readonly pageSize = signal(5)
  readonly pageNo = signal(1)

  readonly #sortedXperts = computed(() => {
    const xperts = this.chatService.xperts()
    const sortOrder = this.sortOrder()
    if (xperts && sortOrder) {
      const sortOrderMap = new Map(sortOrder.map((id, index) => [id, index]))
      return [...xperts].sort(
        (a, b) =>
          (sortOrderMap.get(a.id) ?? 0) - (sortOrderMap.get(b.id) ?? 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }

    return xperts
  })

  readonly xperts = computed(() => {
    const xperts = this.#sortedXperts()
    return xperts?.slice(0, this.pageNo() * this.pageSize())
  })

  readonly hasMore = computed(() => {
    const totalXperts = this.chatService.xperts()?.length
    return totalXperts > this.pageNo() * this.pageSize()
  })

  readonly hasEditXpertPermission = toSignal(
    this.permissionsService.permissions$.pipe(map((permissions) => !!permissions[AIPermissionsEnum.XPERT_EDIT]))
  )

  constructor() {
    effect(() => {
      // console.log(this.#sortedXperts(), this.sortOrder())
    })
  }

  showMore() {
    this.pageNo.update((state) => state + 1)
  }

  showLess() {
    this.pageNo.update((state) => state - 1)
  }

  selectXpert(xpert: IXpert) {
    this.#router.navigate(['/chat/x/', xpert.slug])
  }

  dropSort(event: CdkDragDrop<IXpert[]>) {
    const xperts = this.#sortedXperts().map(({ id }) => id)
    moveItemInArray(xperts, event.previousIndex, event.currentIndex)
    this.#store.updateXpert({ sortOrder: xperts })
  }
}
