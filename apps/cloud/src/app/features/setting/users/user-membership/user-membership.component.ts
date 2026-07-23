import { CommonModule } from '@angular/common'
import { Component, Input, OnChanges, inject, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import {
  AIPermissionsEnum,
  MembershipService,
  RequestScopeLevel,
  Store,
  getErrorMessage,
  injectToastr
} from '../../../../@core'
import { IMembershipPlan, IUserMembership, MembershipRenewalModeEnum, MembershipStatusEnum } from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardInputDirective,
  ZardProgressBarComponent,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom, forkJoin, of } from 'rxjs'

type PointAdjustmentDirection = 'increase' | 'decrease'
const POINT_ADJUSTMENT_VALIDATORS = [
  Validators.required,
  Validators.min(0.001),
  Validators.pattern(/^\d+(\.\d{1,3})?$/)
]

@Component({
  standalone: true,
  selector: 'pac-user-membership',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ZardProgressBarComponent,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  templateUrl: './user-membership.component.html'
})
export class UserMembershipComponent implements OnChanges {
  @Input() userId: string

  readonly #membership = inject(MembershipService)
  readonly #store = inject(Store)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #formBuilder = inject(FormBuilder)

  readonly plans = signal<IMembershipPlan[]>([])
  readonly membership = signal<IUserMembership | null>(null)
  readonly personalPointsBalance = signal(0)
  readonly loading = signal(false)

  readonly MembershipRenewalModeEnum = MembershipRenewalModeEnum
  readonly MembershipStatusEnum = MembershipStatusEnum

  readonly assignmentForm = this.#formBuilder.nonNullable.group({
    planId: ['', Validators.required],
    renewalMode: this.#formBuilder.nonNullable.control<MembershipRenewalModeEnum>(
      MembershipRenewalModeEnum.Auto,
      Validators.required
    ),
    note: ['']
  })
  readonly cyclePointsForm = this.#formBuilder.nonNullable.group({
    direction: this.#formBuilder.nonNullable.control<PointAdjustmentDirection>('increase', Validators.required),
    points: [0, POINT_ADJUSTMENT_VALIDATORS],
    reason: ['']
  })
  readonly personalPointsForm = this.#formBuilder.nonNullable.group({
    direction: this.#formBuilder.nonNullable.control<PointAdjustmentDirection>('increase', Validators.required),
    points: [0, POINT_ADJUSTMENT_VALIDATORS],
    reason: ['']
  })

  get canManage() {
    return this.#store.hasPermission(AIPermissionsEnum.COPILOT_EDIT as never)
  }

  get canManagePersonalPoints() {
    return this.canManage && this.#store.activeScope.level === RequestScopeLevel.TENANT
  }

  ngOnChanges() {
    if (this.userId && this.canManage) {
      this.load()
    }
  }

  load() {
    this.loading.set(true)
    forkJoin({
      plans: this.#membership.getPlans(),
      memberships: this.#membership.getAdminUsers({ userId: this.userId, take: 1 }),
      personalPoints: this.canManagePersonalPoints
        ? this.#membership.getPersonalPoints(this.userId)
        : of({ balance: 0 })
    }).subscribe({
      next: ({ plans, memberships, personalPoints }) => {
        this.plans.set(plans.filter((plan) => plan.status === 'active'))
        const membership = memberships.items?.[0] ?? null
        this.membership.set(membership)
        this.personalPointsBalance.set(personalPoints.balance)
        this.assignmentForm.patchValue({
          planId: membership?.planId ?? this.plans()[0]?.id ?? '',
          renewalMode: membership?.renewalMode ?? MembershipRenewalModeEnum.Auto
        })
        this.loading.set(false)
      },
      error: (error) => this.handleError(error)
    })
  }

  assign() {
    if (this.assignmentForm.invalid) {
      this.assignmentForm.markAllAsTouched()
      return
    }
    const { planId, renewalMode, note } = this.assignmentForm.getRawValue()
    this.loading.set(true)
    this.#membership
      .assignUser(this.userId, {
        planId,
        renewalMode,
        note: note || null
      })
      .subscribe({
        next: (membership) => {
          this.membership.set(membership)
          this.assignmentForm.controls.note.reset()
          this.loading.set(false)
        },
        error: (error) => this.handleError(error)
      })
  }

  async renew() {
    if (
      await this.confirmMembershipAction({
        titleKey: 'PAC.Membership.RenewConfirmTitle',
        titleDefault: 'Renew membership?',
        descriptionKey: 'PAC.Membership.RenewConfirmDescription',
        descriptionDefault:
          'A new membership period will be created from the current period end, and cycle points will be reset.',
        actionKey: 'PAC.Membership.Renew',
        actionDefault: 'Renew'
    })
    ) {
      this.runMembershipAction(this.#membership.renewUser(this.userId))
    }
  }

  async pause() {
    if (
      await this.confirmMembershipAction({
        titleKey: 'PAC.Membership.PauseConfirmTitle',
        titleDefault: 'Pause membership?',
        descriptionKey: 'PAC.Membership.PauseConfirmDescription',
        descriptionDefault: 'The user will temporarily lose access to the current plan benefits.',
        actionKey: 'PAC.Membership.Pause',
        actionDefault: 'Pause'
      })
    ) {
    this.runMembershipAction(this.#membership.pauseUser(this.userId))
  }
  }

  async resume() {
    if (
      await this.confirmMembershipAction({
        titleKey: 'PAC.Membership.ResumeConfirmTitle',
        titleDefault: 'Resume membership?',
        descriptionKey: 'PAC.Membership.ResumeConfirmDescription',
        descriptionDefault: 'The user will regain access to the current plan benefits.',
        actionKey: 'PAC.Membership.Resume',
        actionDefault: 'Resume'
      })
    ) {
    this.runMembershipAction(this.#membership.resumeUser(this.userId))
  }
  }

  async revoke() {
    if (
      await this.confirmMembershipAction({
        titleKey: 'PAC.Membership.RevokeConfirmTitle',
        titleDefault: 'Revoke membership?',
        descriptionKey: 'PAC.Membership.RevokeConfirmDescription',
        descriptionDefault:
          'The current plan will end immediately. Unused cycle points will no longer be available; personal permanent points are unaffected.',
        actionKey: 'PAC.Membership.Revoke',
        actionDefault: 'Revoke',
        destructive: true
      })
    ) {
    this.runMembershipAction(this.#membership.revokeUser(this.userId))
  }
  }

  adjust() {
    if (this.cyclePointsForm.invalid) {
      this.cyclePointsForm.markAllAsTouched()
      return
    }
    const { direction, points, reason } = this.cyclePointsForm.getRawValue()
    const pointDelta = this.toSignedPointDelta(direction, points)
    if (!pointDelta || !this.canAdjustCyclePoints()) {
      return
    }
    this.loading.set(true)
    this.#membership.adjustUserPoints(this.userId, { pointDelta, reason: reason || null }).subscribe({
        next: (membership) => {
          this.membership.set(membership)
        this.cyclePointsForm.reset({ direction: 'increase', points: 0, reason: '' })
          this.loading.set(false)
        },
        error: (error) => this.handleError(error)
      })
  }

  adjustPersonal() {
    if (!this.canManagePersonalPoints) {
      return
    }

    if (this.personalPointsForm.invalid) {
      this.personalPointsForm.markAllAsTouched()
      return
    }
    const { direction, points, reason } = this.personalPointsForm.getRawValue()
    const pointDelta = this.toSignedPointDelta(direction, points)
    if (!pointDelta) {
      return
    }
    this.loading.set(true)
    this.#membership
      .adjustPersonalPoints(this.userId, {
        pointDelta,
        reason: reason || null
      })
      .subscribe({
        next: ({ balance }) => {
          this.personalPointsBalance.set(balance)
          this.personalPointsForm.reset({ direction: 'increase', points: 0, reason: '' })
          this.loading.set(false)
        },
        error: (error) => this.handleError(error)
      })
  }

  usedPercent() {
    const membership = this.membership()
    if (!membership?.pointsGranted || this.isUnlimited()) {
      return 0
    }
    return Math.min(100, Math.round(((membership.pointsUsed ?? 0) / membership.pointsGranted) * 100))
  }

  remainingPoints() {
    const membership = this.membership()
    if (this.isUnlimited()) {
      return null
    }
    return Math.max(0, (membership?.pointsGranted ?? 0) - (membership?.pointsUsed ?? 0))
  }

  isUnlimited() {
    const membership = this.membership()
    return !!membership && membership.pointsGranted === null
  }

  canAdjustCyclePoints() {
    return this.membership()?.status === MembershipStatusEnum.Active && !this.isUnlimited()
  }

  private toSignedPointDelta(direction: PointAdjustmentDirection, value: number) {
    const points = Math.abs(Number(value))
    return direction === 'decrease' ? -points : points
  }

  private confirmMembershipAction(options: {
    titleKey: string
    titleDefault: string
    descriptionKey: string
    descriptionDefault: string
    actionKey: string
    actionDefault: string
    destructive?: boolean
  }) {
    return firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant(options.titleKey, { Default: options.titleDefault }),
        description: this.#translate.instant(options.descriptionKey, { Default: options.descriptionDefault }),
        actionText: this.#translate.instant(options.actionKey, { Default: options.actionDefault }),
        cancelText: this.#translate.instant('PAC.ACTIONS.Cancel', { Default: 'Cancel' }),
        destructive: options.destructive
      })
    )
  }

  private runMembershipAction(request: ReturnType<MembershipService['renewUser']>) {
    this.loading.set(true)
    request.subscribe({
      next: (membership) => {
        this.membership.set(membership)
        this.loading.set(false)
      },
      error: (error) => this.handleError(error)
    })
  }

  private handleError(error: unknown) {
    this.loading.set(false)
    this.#toastr.error(getErrorMessage(error))
  }
}
