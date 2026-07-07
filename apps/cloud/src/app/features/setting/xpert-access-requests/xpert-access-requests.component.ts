import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { injectOrganization } from '@xpert-ai/cloud/state'
import { TranslateModule } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { XpertAccessRequestReviewListComponent } from '../../xpert-access-requests/review-requests-list.component'

@Component({
  standalone: true,
  selector: 'pac-xpert-access-requests-settings',
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardIconComponent,
    XpertAccessRequestReviewListComponent
  ],
  template: `
    <section class="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-background px-4 py-4 xl:px-6">
      <header class="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div class="min-w-0 space-y-4">
            <div class="flex min-w-0 items-start gap-3">
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"
              >
                <z-icon zType="approval" zSize="lg" />
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h1 class="truncate text-xl font-semibold text-foreground">
                    {{ 'PAC.XpertAccessRequests.Title' | translate: { Default: 'Xpert access approvals' } }}
                  </h1>
                  <z-badge zType="outline" zShape="pill">
                    {{ 'PAC.XpertAccessRequests.PendingBadge' | translate: { Default: 'Pending review' } }}
                  </z-badge>
                </div>
                <p class="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {{
                    'PAC.XpertAccessRequests.Subtitle'
                      | translate
                        : { Default: 'Review pending requests for published xperts in the current organization.' }
                  }}
                </p>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              @if (organization(); as organization) {
                <div
                  class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
                >
                  <z-icon zType="corporate_fare" class="size-3.5" />
                  <span>{{ 'PAC.KEY_WORDS.ORGANIZATION' | translate: { Default: 'Organization' } }}</span>
                  <span class="font-medium text-foreground">{{ organization.name }}</span>
                </div>
              }
              <div
                class="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground"
              >
                <z-icon zType="shield" class="size-3.5" />
                <span>
                  {{
                    'PAC.XpertAccessRequests.ReviewScope'
                      | translate: { Default: 'Only requests you can approve are shown' }
                  }}
                </span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,10rem)]">
            <div class="rounded-lg border border-border bg-background px-4 py-3">
              <div class="text-2xl font-semibold text-foreground">{{ reviewableCount() }}</div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ 'PAC.XpertAccessRequests.PendingRequests' | translate: { Default: 'pending requests' } }}
              </div>
            </div>
            <div class="rounded-lg border border-border bg-background px-4 py-3">
              <div class="text-2xl font-semibold text-foreground">{{ filteredCount() }}</div>
              <div class="mt-1 text-xs text-muted-foreground">
                {{ 'PAC.XpertAccessRequests.VisibleRequests' | translate: { Default: 'visible now' } }}
              </div>
            </div>
          </div>
        </div>
      </header>

      <xp-xpert-access-request-review-list
        class="block min-h-0 flex-1"
        (requestCountChange)="reviewableCount.set($event)"
        (visibleCountChange)="filteredCount.set($event)"
      />
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertAccessRequestsSettingsComponent {
  readonly organization = injectOrganization()
  readonly reviewableCount = signal(0)
  readonly filteredCount = signal(0)
}
