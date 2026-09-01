import { CommonModule } from '@angular/common'
import { Component, OnInit, inject, signal } from '@angular/core'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { IChatConversation } from '@xpert-ai/contracts'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { XpertProjectApiService } from './project-api.service'

@Component({
  standalone: true,
  selector: 'xp-project-conversations',
  imports: [CommonModule, RouterLink, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  template: `
    <section class="mx-auto flex w-full flex-col gap-4 p-4 sm:p-6">
      <header class="flex items-end justify-between">
        <div>
          <p class="text-xs font-medium uppercase tracking-wide text-text-tertiary">
            {{ 'XP.XProject.AICollaboration' | translate }}
          </p>
          <h2 class="mt-1 text-xl font-semibold text-text-primary">{{ 'XP.XProject.Conversations' | translate }}</h2>
        </div>
        <a
          z-button
          zType="default"
          zSize="default"
          [routerLink]="['/project', projectId]"
          [queryParams]="{ chat: 'open' }"
          ><i class="ri-add-line mr-1"></i>{{ 'XP.XProject.StartConversation' | translate }}</a
        >
      </header>
      <z-card class="w-full border border-divider-regular bg-components-card-bg shadow-none"
        ><z-card-content class="p-0">
          @if (loading()) {
            <p class="px-5 py-10 text-center text-sm text-text-tertiary">
              {{ 'XP.XProject.LoadingConversations' | translate }}
            </p>
          } @else {
            @for (conversation of conversations(); track conversation.id) {
              <a
                class="flex items-center justify-between gap-3 border-b border-divider-subtle px-5 py-4 last:border-0 hover:bg-background-default-subtle"
                [routerLink]="['/project', projectId]"
                [queryParams]="{
                  chat: 'open',
                  threadId: conversation.threadId,
                  xpert: conversation.xpertId
                }"
                ><div class="flex min-w-0 items-center gap-3">
                  <span class="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary"
                    ><i class="ri-chat-3-line"></i
                  ></span>
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-text-primary">
                      {{ conversation.title || ('XP.XProject.UntitledConversation' | translate) }}
                    </p>
                    <p class="text-xs text-text-tertiary">
                      {{
                        conversation.updatedAt
                          ? (conversation.updatedAt | date: 'medium')
                          : ('XP.XProject.NoActivityDate' | translate)
                      }}
                    </p>
                  </div>
                </div>
                <z-badge zType="outline">{{ 'XP.XProject.Open' | translate }}</z-badge></a
              >
            } @empty {
              <p class="px-5 py-10 text-center text-sm text-text-tertiary">
                {{ 'XP.XProject.NoProjectConversations' | translate }}
              </p>
            }
          }
        </z-card-content></z-card
      >
    </section>
  `,
  host: { class: 'block w-full min-w-0' }
})
export class XpertProjectConversationsComponent implements OnInit {
  readonly #api = inject(XpertProjectApiService)
  readonly #route = inject(ActivatedRoute)
  readonly projectId = this.#route.parent?.snapshot.paramMap.get('id') ?? ''
  readonly conversations = signal<IChatConversation[]>([])
  readonly loading = signal(false)
  ngOnInit() {
    const id = this.#route.parent?.snapshot.paramMap.get('id') ?? ''
    if (!id) return
    this.loading.set(true)
    firstValueFrom(this.#api.conversations(id))
      .then((response) => this.conversations.set(response.items ?? []))
      .finally(() => this.loading.set(false))
  }
}
