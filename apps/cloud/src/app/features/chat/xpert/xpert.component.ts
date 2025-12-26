import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy, signal } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { IXpert, OrderTypeEnum, PaginationParams, XpertAPIService, XpertTypeEnum } from '@cloud/app/@core'
import { injectWorkspaceService } from '@cloud/app/@core/services/xpert-workspace.service'
import { provideOcap } from '@cloud/app/@core/providers/ocap'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ChatService, XpertChatAppComponent, XpertOcapService } from '@cloud/app/xpert'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { provideOcapCore } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectParams } from 'ngxtension/inject-params'
import { Subscription, of } from 'rxjs'
import { catchError, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs/operators'
import { ChatPlatformService } from '../chat.service'
import { ChatHomeService } from '../home.service'
import { ChatHomeComponent } from '../home/home.component'
import { ChatXpertsComponent } from '../xperts/xperts.component'

/**
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    CdkMenuModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    EmojiAvatarComponent,
    NgmSpinComponent,
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
export class ChatXpertComponent implements OnDestroy {
  readonly chatService = inject(ChatPlatformService)
  readonly homeService = inject(ChatHomeService)
  readonly chatHomeComponent = inject(ChatHomeComponent)
  readonly xpertService = inject(XpertAPIService)
  readonly #workspaceService = injectWorkspaceService()
  readonly paramId = injectParams('id')

  readonly xpert = this.chatService.xpert
  readonly xperts = this.homeService.sortedXperts

  readonly searchControl = new FormControl('')
  readonly showXpertDropdown = signal(false)
  readonly searchingXperts = signal(false)
  readonly matchedXperts = signal<IXpert[]>([])

  readonly filteredXperts = computed(() => {
    const allXperts = this.xperts() || []
    const searchText = this.searchControl.value?.toLowerCase() || ''
    const matchedIds = new Set(this.matchedXperts().map(x => x.id))

    if (searchText) {
      return allXperts.filter(xpert => {
        if (matchedIds.has(xpert.id)) {
          return false
        }
        return (
          xpert.name?.toLowerCase().includes(searchText) ||
          xpert.title?.toLowerCase().includes(searchText) ||
          xpert.description?.toLowerCase().includes(searchText)
        )
      })
    }

    return allXperts.filter(xpert => !matchedIds.has(xpert.id))
  })

  readonly hasNoPublishedXperts = computed(() => {
    const hasSearchText = !!this.searchControl.value
    return (!hasSearchText && this.filteredXperts().length === 0 && this.matchedXperts().length === 0)
  })

  private searchXpertSub: Subscription

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
      },
      { allowSignalWrites: true }
    )

    this.searchXpertSub = this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((searchText) => {
        if (!searchText || searchText.trim().length === 0) {
          this.matchedXperts.set([])
          this.showXpertDropdown.set(false)
          return of([])
        }

        this.searchingXperts.set(true)
        this.showXpertDropdown.set(true)

        return this.#workspaceService.getAllMy({ take: 1 }).pipe(
          switchMap((workspaces) => {
            const workspaceId = workspaces.items?.[0]?.id || null

            const options: PaginationParams<IXpert> = {
              where: {
                type: XpertTypeEnum.Agent,
                latest: true
              },
              order: { updatedAt: OrderTypeEnum.DESC },
              take: 10
            }

            return this.xpertService.getAllByWorkspace(workspaceId, options, true).pipe(
              map(({ items }) => {
                const lowerSearch = searchText.toLowerCase()
                return (items || []).filter(xpert =>
                  xpert.name?.toLowerCase().includes(lowerSearch) ||
                  xpert.title?.toLowerCase().includes(lowerSearch) ||
                  xpert.description?.toLowerCase().includes(lowerSearch)
                )
              }),
              catchError(() => {
                return of([])
              })
            )
          }),
          catchError(() => {
            return of([])
          })
        )
      })
    ).subscribe({
      next: (xperts: IXpert[]) => {
        this.matchedXperts.set(xperts)
        this.searchingXperts.set(false)
      },
      error: () => {
        this.matchedXperts.set([])
        this.searchingXperts.set(false)
      }
    })
  }

  newConv() {
    this.chatService.newConv()
  }

  newXpertConv(xpert?: IXpert) {
    this.chatService.newConv(xpert)
  }

  selectXpert(xpert: IXpert) {
    this.newXpertConv(xpert)
    this.searchControl.setValue('', { emitEvent: false })
    this.matchedXperts.set([])
    this.showXpertDropdown.set(false)
  }

  onSearchBlur() {
    setTimeout(() => {
      if (!this.searchControl.value) {
        this.showXpertDropdown.set(false)
      }
    }, 200)
  }

  ngOnDestroy() {
    if (this.searchXpertSub) {
      this.searchXpertSub.unsubscribe()
    }
  }
}
