import { CommonModule } from '@angular/common'
import { Component, Input, OnChanges, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import {
  AIPermissionsEnum,
  MembershipService,
  RequestScopeLevel,
  Store,
  getErrorMessage,
  injectToastr
} from '../../../../@core'
import { IMembershipPlan, IUserMembership } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective, ZardProgressBarComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-user-membership',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardProgressBarComponent
  ],
  templateUrl: './user-membership.component.html'
})
export class UserMembershipComponent implements OnChanges {
  @Input() userId: string

  readonly #membership = inject(MembershipService)
  readonly #store = inject(Store)
  readonly #toastr = injectToastr()

  readonly plans = signal<IMembershipPlan[]>([])
  readonly membership = signal<IUserMembership | null>(null)
  readonly loading = signal(false)

  selectedPlanId = ''
  note = ''
  pointDelta = 0
  reason = ''

  get canManage() {
    return (
      this.#store.activeScope.level === RequestScopeLevel.TENANT &&
      this.#store.hasPermission(AIPermissionsEnum.MEMBERSHIP_EDIT as never)
    )
  }

  ngOnChanges() {
    if (this.userId && this.canManage) {
      this.load()
    }
  }

  load() {
    this.loading.set(true)
    this.#membership.getPlans().subscribe({
      next: (plans) => {
        this.plans.set(plans.filter((plan) => plan.status === 'active'))
        this.#membership.getAdminUsers({ userId: this.userId, take: 1 }).subscribe({
          next: (result) => {
            const membership = result.items?.[0] ?? null
            this.membership.set(membership)
            this.selectedPlanId = membership?.planId ?? this.plans()[0]?.id ?? ''
            this.loading.set(false)
          },
          error: (error) => this.handleError(error)
        })
      },
      error: (error) => this.handleError(error)
    })
  }

  assign() {
    if (!this.selectedPlanId) {
      return
    }
    this.loading.set(true)
    this.#membership.assignUser(this.userId, { planId: this.selectedPlanId, note: this.note || null }).subscribe({
      next: (membership) => {
        this.membership.set(membership)
        this.note = ''
        this.loading.set(false)
      },
      error: (error) => this.handleError(error)
    })
  }

  renew() {
    this.loading.set(true)
    this.#membership.renewUser(this.userId).subscribe({
      next: (membership) => {
        this.membership.set(membership)
        this.loading.set(false)
      },
      error: (error) => this.handleError(error)
    })
  }

  adjust() {
    if (!this.pointDelta) {
      return
    }
    this.loading.set(true)
    this.#membership
      .adjustUserPoints(this.userId, { pointDelta: Number(this.pointDelta), reason: this.reason || null })
      .subscribe({
        next: (membership) => {
          this.membership.set(membership)
          this.pointDelta = 0
          this.reason = ''
          this.loading.set(false)
        },
        error: (error) => this.handleError(error)
      })
  }

  usedPercent() {
    const membership = this.membership()
    if (!membership?.pointsGranted) {
      return 0
    }
    return Math.min(100, Math.round(((membership.pointsUsed ?? 0) / membership.pointsGranted) * 100))
  }

  remainingPoints() {
    const membership = this.membership()
    return Math.max(0, (membership?.pointsGranted ?? 0) - (membership?.pointsUsed ?? 0))
  }

  private handleError(error: unknown) {
    this.loading.set(false)
    this.#toastr.error(getErrorMessage(error))
  }
}
