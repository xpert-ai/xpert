import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import {
  IMembershipPlan,
  IMembershipScopeStatus,
  MEMBERSHIP_TOKENS_PER_POINT_OPTIONS,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum
} from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { forkJoin } from 'rxjs'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'pac-membership-admin',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardCardImports,
    ...ZardSelectImports
  ],
  templateUrl: './membership.component.html',
  styleUrls: ['./membership.component.scss']
})
export class MembershipAdminComponent implements OnInit {
  readonly #membership = inject(MembershipService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly plans = signal<IMembershipPlan[]>([])
  readonly scopeStatus = signal<IMembershipScopeStatus | null>(null)
  readonly loading = signal(false)
  readonly editing = signal(false)
  readonly selectedPlanId = signal<string | null>(null)
  readonly activePlanCount = computed(
    () => this.plans().filter((plan) => plan.status === MembershipPlanStatusEnum.Active).length
  )
  readonly archivedPlanCount = computed(
    () => this.plans().filter((plan) => plan.status === MembershipPlanStatusEnum.Archived).length
  )
  readonly defaultPlan = computed(() => this.plans().find((plan) => plan.isDefault) ?? null)
  readonly isOrganizationScope = computed(() => this.scopeStatus()?.scope === 'organization')
  readonly showScopeAction = computed(() => {
    const status = this.scopeStatus()
    return !!status && status.scope === 'organization' && (!status.initialized || status.needsRepair)
  })
  readonly selectedPlan = computed(() => {
    const selectedPlanId = this.selectedPlanId()
    return selectedPlanId ? (this.plans().find((plan) => plan.id === selectedPlanId) ?? null) : null
  })
  readonly tokensPerPointOptions = MEMBERSHIP_TOKENS_PER_POINT_OPTIONS

  MembershipPlanStatusEnum = MembershipPlanStatusEnum
  MembershipPeriodEnum = MembershipPeriodEnum

  draft: Partial<IMembershipPlan> = this.createDefaultDraft()
  modelMultipliersText = '[]'
  rateLimitsText = '[]'

  ngOnInit() {
    this.load()
  }

  load() {
    this.loading.set(true)
    forkJoin({
      status: this.#membership.getScopeStatus(),
      plans: this.#membership.getPlans()
    }).subscribe({
      next: ({ status, plans }) => {
        this.scopeStatus.set(status)
        this.plans.set(plans)
        const selectedPlanId = this.selectedPlanId()
        if (!selectedPlanId || !plans.some((plan) => plan.id === selectedPlanId)) {
          this.selectedPlanId.set(plans.find((plan) => plan.isDefault)?.id ?? plans[0]?.id ?? null)
        }
        this.loading.set(false)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  initializeScope() {
    this.loading.set(true)
    this.#membership.initializeScope().subscribe({
      next: (status) => {
        this.scopeStatus.set(status)
        this.#toastr.success(
          this.#translate.instant('PAC.Membership.InitializeSuccess', {
            Default: 'Organization membership is ready.'
          })
        )
        this.load()
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  create() {
    this.draft = this.createDefaultDraft()
    this.modelMultipliersText = '[]'
    this.rateLimitsText = '[]'
    this.selectedPlanId.set(null)
    this.editing.set(true)
  }

  edit(plan: IMembershipPlan) {
    this.draft = { ...plan }
    this.modelMultipliersText = JSON.stringify(plan.modelMultipliers ?? [], null, 2)
    this.rateLimitsText = JSON.stringify(plan.rateLimits ?? [], null, 2)
    this.selectedPlanId.set(plan.id)
    this.editing.set(true)
  }

  cancel() {
    this.editing.set(false)
    if (!this.selectedPlanId()) {
      this.selectedPlanId.set(this.defaultPlan()?.id ?? this.plans()[0]?.id ?? null)
    }
  }

  save() {
    const payload = this.buildPayload()
    if (!payload) {
      return
    }

    this.loading.set(true)
    const request = this.draft.id
      ? this.#membership.updatePlan(this.draft.id, payload)
      : this.#membership.createPlan(payload)

    request.subscribe({
      next: (plan) => {
        if (plan?.id) {
          this.selectedPlanId.set(plan.id)
        }
        this.loading.set(false)
        this.editing.set(false)
        this.load()
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  archive(plan: IMembershipPlan) {
    if (!plan.id) {
      return
    }
    this.loading.set(true)
    this.#membership.archivePlan(plan.id).subscribe({
      next: () => {
        this.loading.set(false)
        this.load()
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  remainingLabel(plan: IMembershipPlan) {
    return `${this.pointsLabel(plan.includedPoints)} / ${plan.tokensPerPoint ?? 0}`
  }

  pointsLabel(points?: number | null) {
    return points === null
      ? this.#translate.instant('PAC.Membership.Unlimited', { Default: 'Unlimited' })
      : String(points ?? 0)
  }

  scopeDefaultPlanLabel(status: IMembershipScopeStatus | null) {
    if (!status?.defaultPlan) {
      return this.#translate.instant('PAC.Membership.NoDefaultPlan', { Default: 'No default plan' })
    }
    return `${status.defaultPlan.name} · ${this.pointsLabel(status.defaultPlan.includedPoints)}`
  }

  scopeStatusLabel(status: IMembershipScopeStatus | null) {
    if (!status) {
      return this.#translate.instant('PAC.KEY_WORDS.Loading', { Default: 'Loading...' })
    }
    if (status.initialized) {
      return this.#translate.instant('PAC.Membership.ScopeInitialized', { Default: 'Initialized' })
    }
    if (status.needsRepair) {
      return this.#translate.instant('PAC.Membership.ScopeNeedsRepair', { Default: 'Needs repair' })
    }
    return this.#translate.instant('PAC.Membership.ScopeNotInitialized', { Default: 'Not initialized' })
  }

  setDraftUnlimited(enabled: boolean) {
    this.draft.includedPoints = enabled ? null : 1000
  }

  selectPlan(plan: IMembershipPlan) {
    this.selectedPlanId.set(plan.id)
    if (this.editing()) {
      this.edit(plan)
    }
  }

  setDraftStatus(value: string | number | Array<string | number>) {
    const next = Array.isArray(value) ? value[0] : value
    this.draft.status = next as MembershipPlanStatusEnum
  }

  setDraftTokensPerPoint(value: string | number | Array<string | number>) {
    const next = Number(Array.isArray(value) ? value[0] : value)
    if (MEMBERSHIP_TOKENS_PER_POINT_OPTIONS.some((option) => option === next)) {
      this.draft.tokensPerPoint = next
    }
  }

  tokensPerPointLabel(value: number) {
    return value >= 1_000_000 ? `${value / 1_000_000}M` : `${value / 1_000}k`
  }

  modelMultiplierCount(plan: IMembershipPlan | null) {
    return plan?.modelMultipliers?.length ?? 0
  }

  rateLimitCount(plan: IMembershipPlan | null) {
    return plan?.rateLimits?.length ?? 0
  }

  private buildPayload(): Partial<IMembershipPlan> | null {
    try {
      return {
        ...this.draft,
        includedPoints: this.draft.includedPoints === null ? null : Number(this.draft.includedPoints ?? 0),
        tokensPerPoint: Number(this.draft.tokensPerPoint ?? 0),
        priceAmount:
          this.draft.priceAmount === null || this.draft.priceAmount === undefined
            ? null
            : Number(this.draft.priceAmount),
        modelMultipliers: JSON.parse(this.modelMultipliersText || '[]'),
        rateLimits: JSON.parse(this.rateLimitsText || '[]')
      }
    } catch {
      this.#toastr.error(
        this.#translate.instant('PAC.Membership.InvalidJson', { Default: 'Invalid JSON configuration.' })
      )
      return null
    }
  }

  private createDefaultDraft(): Partial<IMembershipPlan> {
    return {
      code: '',
      name: '',
      status: MembershipPlanStatusEnum.Active,
      isDefault: false,
      period: MembershipPeriodEnum.Monthly,
      includedPoints: 1000,
      tokensPerPoint: 1000,
      modelMultipliers: [],
      rateLimits: []
    }
  }
}
