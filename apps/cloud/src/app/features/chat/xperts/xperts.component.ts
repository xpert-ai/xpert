import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { injectXpertPreferences, Store } from '@metad/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { NgxPermissionsService } from 'ngx-permissions'
import { map } from 'rxjs'
import { AIPermissionsEnum, IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { ChatService } from '../chat.service'

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
  readonly chatService = inject(ChatService)
  readonly permissionsService = inject(NgxPermissionsService)
  readonly #preferences = injectXpertPreferences()
  readonly #store = inject(Store)

  readonly sortOrder = computed(() => this.#preferences()?.sortOrder)
  readonly pageSize = signal(5)
  readonly pageNo = signal(1)

  readonly xperts = computed(() => {
    const xperts = this.chatService.xperts()
    if (!xperts) {
      return null
    }
    const sortOrder = this.sortOrder()
    if (sortOrder) {
      const sortOrderMap = new Map(sortOrder.map((id, index) => [id, index]))
      xperts.sort(
        (a, b) =>
          (sortOrderMap.get(a.id) ?? Infinity) - (sortOrderMap.get(b.id) ?? Infinity) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }
    return xperts.slice(0, this.pageNo() * this.pageSize())
  })

  readonly hasMore = computed(() => {
    const totalXperts = this.chatService.xperts().length
    return totalXperts > (this.pageNo() + 1) * this.pageSize()
  })

  readonly hasEditXpertPermission = toSignal(
    this.permissionsService.permissions$.pipe(map((permissions) => !!permissions[AIPermissionsEnum.XPERT_EDIT]))
  )

  showMore() {
    this.pageNo.update((state) => state + 1)
  }

  showLess() {
    this.pageNo.update((state) => state - 1)
  }

  selectXpert(xpert: IXpert) {
    this.chatService.newConversation(xpert)
  }

  dropSort(event: CdkDragDrop<IXpert[]>) {
    const xperts = this.xperts().map(({ id }) => id)
    moveItemInArray(xperts, event.previousIndex, event.currentIndex)
    this.#store.updateXpert({ sortOrder: xperts })
  }
}
