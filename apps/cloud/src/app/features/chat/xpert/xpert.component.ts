import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { IXpert } from '@cloud/app/@core'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '@cloud/app/xpert'
import { provideOcapCore } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { ChatPlatformService } from '../chat.service'
import { ChatHomeService } from '../home.service'
import { ChatHomeComponent } from '../home/home.component'
import { ChatXpertsComponent } from '../xperts/xperts.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
/**
 */
@Component({
  standalone: true,
  imports: [
    RouterModule,
    CdkMenuModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    EmojiAvatarComponent,
    XpertChatAppComponent,
    ChatXpertsComponent
],
  selector: 'pac-chat-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [],
  providers: [
    ChatPlatformService,
    { provide: ChatService, useExisting: ChatPlatformService },
    provideOcapCore(),
    provideOcap(),
    XpertOcapService
  ]
})
export class ChatXpertComponent {
  readonly chatService = inject(ChatPlatformService)
  readonly homeService = inject(ChatHomeService)
  readonly chatHomeComponent = inject(ChatHomeComponent)
  readonly paramId = injectParams('id')

  readonly xpert = this.chatService.xpert
  readonly xperts = this.homeService.sortedXperts

  readonly searchControl = new FormControl('')
  readonly searchText = signal('')

  readonly filteredXperts = computed(() => {
    const allXperts = this.xperts() || []
    const searchText = this.searchText()?.toLowerCase() || ''

    if (searchText) {
      return allXperts.filter(
        (xpert) =>
          xpert.name?.toLowerCase().includes(searchText) ||
          xpert.title?.toLowerCase().includes(searchText) ||
          xpert.description?.toLowerCase().includes(searchText)
      )
    }

    return allXperts
  })

  readonly hasNoPublishedXperts = computed(() => {
    return !this.searchText() && this.filteredXperts().length === 0
  })

  constructor() {
    effect(
      () => {
        if (this.paramId()) {
          this.chatHomeComponent.currentPage.set({
            type: 'conversation',
            id: this.paramId()
          })
          this.chatHomeComponent.historyExpanded.set(true)
        }
      }
    )

    this.searchControl.valueChanges.subscribe((value) => {
      this.searchText.set(value || '')
    })
  }

  newConv() {
    this.chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.chatService.newConv(xpert)
  }
}
