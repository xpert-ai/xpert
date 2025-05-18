import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal, ViewContainerRef } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { provideECharts } from '@cloud/app/@core/providers/echarts'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { HeaderUserComponent, OrganizationSelectorComponent } from '@cloud/app/@theme/header'
import { C_URI_API_MODELS, LanguagesEnum } from '@metad/cloud/state'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { TranslateModule } from '@ngx-translate/core'
import { provideMarkdown } from 'ngx-markdown'
import {
  ChatConversationService,
  injectLanguage,
  injectToastr,
  PAC_SERVER_AGENT_DEFAULT_OPTIONS,
  PAC_SERVER_DEFAULT_OPTIONS,
  routeAnimations,
  Store,
  XpertService
} from '../../@core'
import { ChatAppService } from '../chat-app.service'
import { ChatService } from '../chat.service'
import { ChatConversationsComponent } from '../conversations/conversations.component'
import { XpertHomeService } from '../home.service'
import { XpertOcapService } from '../ocap.service'
import { XpertChatAppComponent } from '../xpert/xpert.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
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
    MatTooltipModule,
    OrganizationSelectorComponent,
    HeaderUserComponent,
    XpertChatAppComponent
  ],
  selector: 'chat-home',
  templateUrl: './home.component.html',
  styleUrl: 'home.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideMarkdown({}),
    provideOcapCore(),
    XpertHomeService,
    ChatAppService,
    { provide: ChatService, useExisting: ChatAppService },
    XpertOcapService,
    provideOcap(),
    provideECharts({
      echarts: () => import('echarts')
    }),
    {
      provide: PAC_SERVER_AGENT_DEFAULT_OPTIONS,
      useValue: {
        modelBaseUrl: C_URI_API_MODELS + '/public'
      }
    },
    {
      provide: PAC_SERVER_DEFAULT_OPTIONS,
      useValue: { modelEnv: 'public' }
    }
  ]
})
export class ChatHomeComponent {
  readonly store = inject(Store)
  readonly chatService = inject(ChatService)
  readonly conversationService = inject(ChatConversationService)
  readonly xpertService = inject(XpertService)
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
      .closed.subscribe({
        next: () => {}
      })
  }

  selectLang(selectLang: LanguagesEnum) {
    this.i18nService.changeLanguage(selectLang)
  }
}
