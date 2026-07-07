import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardInputGroupComponent,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { injectToastr } from '../../@core/services/toastr.service'
import { XpertMarketplaceService } from '../../@core/services/xpert-marketplace.service'
import { getErrorMessage, IXpertAccessRequest } from '../../@core/types'

@Component({
  standalone: true,
  selector: 'xp-xpert-access-request-review-list',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardInputGroupComponent,
    ...ZardTableImports
  ],
  template: `
    <ng-template #searchIcon>
      <z-icon zType="search" class="size-4 text-muted-foreground" />
    </ng-template>

    <section class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <z-input-group class="min-w-[240px] flex-1 md:max-w-[420px]" zSize="sm" [zAddonBefore]="searchIcon">
            <input
              z-input
              type="search"
              [formControl]="searchControl"
              [placeholder]="
                'PAC.XpertAccessRequests.SearchPlaceholder'
                  | translate: { Default: 'Search assistant, requester, or reason' }
              "
            />
          </z-input-group>

          @if (searchTerm()) {
            <button z-button zType="ghost" zSize="sm" type="button" (click)="resetSearch()">
              <z-icon zType="x" />
              {{ 'PAC.KEY_WORDS.Reset' | translate: { Default: 'Reset' } }}
            </button>
          }
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <z-badge zType="outline" zShape="pill">
            {{
              'PAC.XpertAccessRequests.FilteredSummary'
                | translate
                  : {
                      Default: '{{visible}}
            / {{ total }} visible', visible: filteredRequests().length, total: requests().length } }}
          </z-badge>
          <button z-button zType="outline" zSize="sm" type="button" [disabled]="loading()" (click)="load()">
            <z-icon zType="autorenew" [class.animate-spin]="loading()" />
            {{ 'PAC.ACTIONS.Refresh' | translate: { Default: 'Refresh' } }}
          </button>
        </div>
      </div>

      @if (error()) {
        <div
          class="m-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <z-icon zType="triangle-alert" class="mt-0.5 size-4" />
          <span>{{ error() }}</span>
        </div>
      }

      @if (loading()) {
        <div class="grid gap-3 p-4">
          @for (placeholder of [1, 2, 3, 4]; track placeholder) {
            <div class="h-14 animate-pulse rounded-md border border-border bg-muted/30"></div>
          }
        </div>
      } @else if (!requests().length) {
        <div class="flex min-h-64 flex-1 items-center justify-center px-6 py-10 text-center">
          <div class="max-w-md">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <z-icon zType="inbox" zSize="lg" />
            </div>
            <h3 class="mt-4 text-base font-semibold text-foreground">
              {{ 'PAC.XpertAccessRequests.EmptyTitle' | translate: { Default: 'No pending requests' } }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">
              {{
                'PAC.XpertAccessRequests.EmptyHint'
                  | translate: { Default: 'Requests that you can review will appear here.' }
              }}
            </p>
          </div>
        </div>
      } @else if (!filteredRequests().length) {
        <div class="flex min-h-64 flex-1 items-center justify-center px-6 py-10 text-center">
          <div class="max-w-md">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <z-icon zType="search" zSize="lg" />
            </div>
            <h3 class="mt-4 text-base font-semibold text-foreground">
              {{ 'PAC.XpertAccessRequests.NoSearchResultsTitle' | translate: { Default: 'No matching requests' } }}
            </h3>
            <p class="mt-2 text-sm leading-6 text-muted-foreground">
              {{
                'PAC.XpertAccessRequests.NoSearchResultsHint'
                  | translate: { Default: 'Try another assistant name, requester, or reason.' }
              }}
            </p>
          </div>
        </div>
      } @else {
        <div class="min-h-0 flex-1 overflow-auto">
          <table z-table zSize="compact" class="min-w-[960px] table-fixed text-sm">
            <colgroup>
              <col class="w-[25%]" />
              <col class="w-[18%]" />
              <col class="w-[29%]" />
              <col class="w-[15%]" />
              <col class="w-[13%]" />
            </colgroup>
            <thead z-table-header>
              <tr z-table-row class="border-b bg-muted/40 hover:bg-muted/40">
                <th z-table-head class="sticky top-0 z-10 bg-background">
                  {{ 'PAC.XpertAccessRequests.Assistant' | translate: { Default: 'Assistant' } }}
                </th>
                <th z-table-head class="sticky top-0 z-10 bg-background">
                  {{ 'PAC.XpertAccessRequests.Requester' | translate: { Default: 'Requester' } }}
                </th>
                <th z-table-head class="sticky top-0 z-10 bg-background">
                  {{ 'PAC.XpertAccessRequests.Reason' | translate: { Default: 'Reason' } }}
                </th>
                <th z-table-head class="sticky top-0 z-10 bg-background">
                  {{ 'PAC.XpertAccessRequests.RequestedAt' | translate: { Default: 'Requested' } }}
                </th>
                <th z-table-head class="sticky top-0 z-10 bg-background text-right">
                  {{ 'PAC.XpertAccessRequests.Actions' | translate: { Default: 'Actions' } }}
                </th>
              </tr>
            </thead>
            <tbody z-table-body>
              @for (request of filteredRequests(); track request.id) {
                <tr z-table-row class="bg-card">
                  <td z-table-cell>
                    <div class="flex min-w-0 items-center gap-3">
                      <div
                        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground"
                      >
                        {{ xpertInitials(request) }}
                      </div>
                      <div class="min-w-0">
                        <div class="truncate font-semibold text-foreground" [title]="xpertTitle(request)">
                          {{ xpertTitle(request) }}
                        </div>
                        <div class="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                          <z-badge zType="outline" zShape="pill">
                            {{ 'PAC.XpertAccessRequests.Pending' | translate: { Default: 'Pending' } }}
                          </z-badge>
                          <span class="truncate" [title]="request.xpertId">{{ request.xpertId }}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td z-table-cell>
                    <div class="min-w-0">
                      <div class="truncate font-medium text-foreground" [title]="requesterName(request)">
                        {{ requesterName(request) }}
                      </div>
                      <div class="mt-0.5 truncate text-xs text-muted-foreground" [title]="request.requesterId">
                        {{ requesterIdentity(request) }}
                      </div>
                    </div>
                  </td>
                  <td z-table-cell>
                    <div
                      class="max-h-12 overflow-hidden text-sm leading-6 text-foreground"
                      [title]="request.reason || ''"
                    >
                      @if (request.reason?.trim()) {
                        {{ request.reason }}
                      } @else {
                        <span class="text-muted-foreground">
                          {{ 'PAC.XpertAccessRequests.NoReason' | translate: { Default: 'No reason provided.' } }}
                        </span>
                      }
                    </div>
                  </td>
                  <td z-table-cell>
                    @if (request.createdAt) {
                      <span class="text-sm text-muted-foreground">{{
                        request.createdAt | date: 'yyyy-MM-dd HH:mm'
                      }}</span>
                    } @else {
                      <span class="text-muted-foreground">-</span>
                    }
                  </td>
                  <td z-table-cell class="text-right">
                    <div class="inline-flex items-center justify-end gap-2">
                      <button
                        z-button
                        zType="destructive"
                        zSize="sm"
                        type="button"
                        data-testid="reject-request"
                        [disabled]="processingId() === request.id"
                        (click)="reject(request)"
                      >
                        <z-icon zType="block" />
                        {{ 'PAC.ACTIONS.Reject' | translate: { Default: 'Reject' } }}
                      </button>
                      <button
                        z-button
                        zSize="sm"
                        type="button"
                        data-testid="approve-request"
                        [disabled]="processingId() === request.id"
                        (click)="approve(request)"
                      >
                        <z-icon zType="done" />
                        {{ 'PAC.ACTIONS.Approve' | translate: { Default: 'Approve' } }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertAccessRequestReviewListComponent {
  readonly changed = output<void>()
  readonly requestCountChange = output<number>()
  readonly visibleCountChange = output<number>()

  readonly #service = inject(XpertMarketplaceService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly requests = signal<IXpertAccessRequest[]>([])
  readonly loading = signal(true)
  readonly processingId = signal<string | null>(null)
  readonly error = signal<string | null>(null)
  readonly searchTerm = signal('')
  readonly searchControl = new FormControl('', { nonNullable: true })

  readonly filteredRequests = computed(() => {
    const term = this.searchTerm()
    if (!term) {
      return this.requests()
    }

    return this.requests().filter((request) => this.requestSearchText(request).includes(term))
  })

  constructor() {
    this.searchControl.valueChanges
      .pipe(debounceTime(150), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => {
        this.searchTerm.set(value.trim().toLowerCase())
        this.emitVisibleCount()
      })

    void this.load()
  }

  async load() {
    this.loading.set(true)
    this.error.set(null)
    try {
      this.setRequests(await firstValueFrom(this.#service.findReviewableRequests()))
    } catch (error) {
      this.setRequests([])
      const message = getErrorMessage(error)
      this.error.set(message)
      this.#toastr.error(message)
    } finally {
      this.loading.set(false)
    }
  }

  resetSearch() {
    this.searchControl.setValue('')
  }

  async approve(request: IXpertAccessRequest) {
    await this.decide(request, 'approve')
  }

  async reject(request: IXpertAccessRequest) {
    await this.decide(request, 'reject')
  }

  xpertTitle(request: IXpertAccessRequest) {
    return request.xpert?.title || request.xpert?.titleCN || request.xpert?.name || request.xpertId
  }

  xpertInitials(request: IXpertAccessRequest) {
    const initials = this.xpertTitle(request)
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toLowerCase()

    return initials || 'ai'
  }

  requesterName(request: IXpertAccessRequest) {
    const user = request.requester
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ')
    return fullName || user?.email || user?.username || request.requesterId
  }

  requesterIdentity(request: IXpertAccessRequest) {
    const user = request.requester
    return user?.email || user?.username || request.requesterId
  }

  private requestSearchText(request: IXpertAccessRequest) {
    return [
      this.xpertTitle(request),
      request.xpert?.slug,
      request.xpertId,
      this.requesterName(request),
      this.requesterIdentity(request),
      request.reason
    ]
      .filter((value): value is string => typeof value === 'string' && value.length > 0)
      .join(' ')
      .toLowerCase()
  }

  private async decide(request: IXpertAccessRequest, action: 'approve' | 'reject') {
    if (!request.id) {
      return
    }

    this.processingId.set(request.id)
    try {
      if (action === 'approve') {
        await firstValueFrom(
          this.#service.approveRequest(request.id, {
            response: this.#translate.instant('PAC.Explore.AgentSquare.ApprovedResponse', {
              Default: 'Approved.'
            })
          })
        )
      } else {
        await firstValueFrom(
          this.#service.rejectRequest(request.id, {
            response: this.#translate.instant('PAC.Explore.AgentSquare.RejectedResponse', {
              Default: 'Rejected.'
            })
          })
        )
      }

      this.setRequests(this.requests().filter((item) => item.id !== request.id))
      this.changed.emit()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.processingId.set(null)
    }
  }

  private setRequests(requests: IXpertAccessRequest[]) {
    this.requests.set(requests)
    this.requestCountChange.emit(requests.length)
    this.emitVisibleCount()
  }

  private emitVisibleCount() {
    this.visibleCountChange.emit(this.filteredRequests().length)
  }
}
