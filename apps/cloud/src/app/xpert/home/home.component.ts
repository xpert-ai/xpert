import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, inject, signal, ViewContainerRef } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { HeaderUserComponent } from '@cloud/app/@theme/header'
import { LanguagesEnum } from '@cloud/app/@core/state'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatConversationService,
  injectLanguage,
  injectToastr,
  routeAnimations,
  Store,
  XpertAPIService
} from '../../@core'
import { ChatAppService } from '../chat-app.service'
import { ChatService } from '../chat.service'
import { ChatConversationsComponent } from '../conversations/conversations.component'
import { XpertHomeService } from '../home.service'
import { XpertChatAppComponent } from '../xpert/xpert.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkListboxModule,
    CdkMenuModule,
    A11yModule,
    RouterModule,
    TranslateModule,
    WaIntersectionObserver,
    ...ZardTooltipImports,
    HeaderUserComponent,
    XpertChatAppComponent
  ],
  selector: 'xp-chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [XpertHomeService, ChatAppService, { provide: ChatService, useExisting: ChatAppService }]
})
export class ChatHomeComponent {
  readonly store = inject(Store)
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  readonly xpertService = inject(XpertAPIService)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #toastr = injectToastr()
  readonly currentLanguage = injectLanguage()
  readonly i18nService = injectI18nService()

  Languages = Object.values(LanguagesEnum).filter((lang) => lang !== LanguagesEnum.Chinese)

  readonly xpert = this.chatService.xpert
  readonly conversationId = this.chatService.conversationId
  readonly user = toSignal(this.store.user$)

  readonly loading = signal(false)

  // Methods
  openConversations() {
    const xpert = this.xpert()
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr,
        data: {
          xpertSlug: xpert?.slug,
          basePath: '/'
        }
      })
      .closed.subscribe()
  }

  selectLang(selectLang: LanguagesEnum) {
    this.i18nService.changeLanguage(selectLang)
  }
}
