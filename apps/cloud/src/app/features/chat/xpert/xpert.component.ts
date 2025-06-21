import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, ViewContainerRef } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router, RouterModule } from '@angular/router'
import { getErrorMessage, injectProjectService, injectToastr, IXpert, OrderTypeEnum } from '@cloud/app/@core'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ChatConversationsComponent, ChatService, XpertChatAppComponent, XpertOcapService } from '@cloud/app/xpert'
import { linkedModel } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, startWith } from 'rxjs'
import { ChatPlatformService } from '../chat.service'
import { ChatHomeService } from '../home.service'
import { ChatXpertsComponent } from '../xperts/xperts.component'

/**
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    NgmSpinComponent,
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
  readonly projectSercice = injectProjectService()
  readonly #toastr = injectToastr()
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)
  readonly #router = inject(Router)

  readonly xpert = this.chatService.xpert
  readonly xperts = this.homeService.sortedXperts

  readonly #projects = derivedAsync(() =>
    this.projectSercice.getAllMy({order: {updatedAt: OrderTypeEnum.DESC}}).pipe(
      map(({ items }) => ({ projects: items, loading: false })),
      startWith({ loading: true, projects: null })
    )
  )
  readonly projects = computed(() => this.#projects()?.projects)
  readonly projectLoading = linkedModel({
    initialValue: false,
    compute: () => this.#projects()?.loading,
    update: () => {}
  })

  newConv() {
    this.chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.chatService.newConv(xpert)
  }

  openConversations() {
    this.#dialog
      .open(ChatConversationsComponent, {
        viewContainerRef: this.#vcr,
        data: {
          basePath: '/chat',
          xpertId: this.xpert()?.id
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }

  newProject() {
    this.projectLoading.set(true)
    this.projectSercice.create({ name: 'New Project' }).subscribe({
      next: (project) => {
        this.projectLoading.set(false)
        this.#router.navigate(['/chat/p', project.id])
      },
      error: (err) => {
        this.projectLoading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
