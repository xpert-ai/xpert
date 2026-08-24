import { CommonModule } from '@angular/common'
import { Component, computed, inject, OnInit, signal } from '@angular/core'
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { MembershipService, getErrorMessage, injectToastr } from '../../../@core'
import {
  ICopilotWithProvider,
  IMembershipAdminUser,
  IMembershipAllowedModel,
  IMembershipModelMultiplier,
  IMembershipPlan,
  IMembershipRateLimit,
  IMembershipScopeStatus,
  IUserMembership,
  MembershipAdminUserStatusEnum,
  MembershipBulkActionEnum,
  MembershipPeriodEnum,
  MembershipPlanStatusEnum,
  MembershipRenewalModeEnum,
  TMembershipRateLimitPeriod
} from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom, forkJoin } from 'rxjs'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardCheckboxComponent,
  ZardDatePickerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  type ZardPageEvent,
  ZardPaginatorComponent,
  ZardSelectImports,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { userLabel } from '../../../@shared/pipes'
import { format } from 'date-fns'

type MembershipModelOption = {
  value: string
  provider: string
  model: string
  available: boolean
}

type MembershipAdminTab = 'plans' | 'users'

const MEMBERSHIP_RATE_LIMIT_PERIODS: TMembershipRateLimitPeriod[] = ['hour', 'day', 'week', 'cycle']

@Component({
  standalone: true,
  selector: 'xp-membership-admin',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardDatePickerComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardPaginatorComponent,
    ...ZardFormImports,
    ...ZardCardImports,
    ...ZardSelectImports,
    ...ZardTabsImports
  ],
  templateUrl: './membership.component.html',
  styleUrls: ['./membership.component.scss']
})
export class MembershipAdminComponent implements OnInit {
  readonly #membership = inject(MembershipService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #formBuilder = inject(FormBuilder)
  #planMemberLoadSequence = 0

  readonly plans = signal<IMembershipPlan[]>([])
  readonly scopeStatus = signal<IMembershipScopeStatus | null>(null)
  readonly loading = signal(false)
  readonly activeTab = signal<MembershipAdminTab>('plans')
  readonly editing = signal(false)
  readonly selectedPlanId = signal<string | null>(null)
  readonly planMembers = signal<IUserMembership[]>([])
  readonly planMemberCount = signal(0)
  readonly planMembersLoading = signal(false)
  readonly planMemberPageIndex = signal(0)
  readonly planMemberPageSize = signal(10)
  readonly adminMembers = signal<IMembershipAdminUser[]>([])
  readonly adminMemberCount = signal(0)
  readonly adminMembersLoading = signal(false)
  readonly adminMemberPageIndex = signal(0)
  readonly adminMemberPageSize = signal(20)
  readonly selectedUserIds = signal<Set<string>>(new Set())
  readonly selectedUserCount = computed(() => this.selectedUserIds().size)
  readonly allVisibleUsersSelected = computed(
    () => !!this.adminMembers().length && this.adminMembers().every(({ user }) => this.selectedUserIds().has(user.id))
  )
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
  readonly migrationTargets = computed(() =>
    this.plans().filter((plan) => plan.status === MembershipPlanStatusEnum.Active && plan.id !== this.selectedPlanId())
  )
  readonly rateLimitPeriods = MEMBERSHIP_RATE_LIMIT_PERIODS
  readonly modelOptions = signal<MembershipModelOption[]>([])
  readonly globalModelTargetValue = modelOptionValue('', '*')

  MembershipPlanStatusEnum = MembershipPlanStatusEnum
  MembershipPeriodEnum = MembershipPeriodEnum
  MembershipAdminUserStatusEnum = MembershipAdminUserStatusEnum
  MembershipBulkActionEnum = MembershipBulkActionEnum
  MembershipRenewalModeEnum = MembershipRenewalModeEnum

  draft: Partial<IMembershipPlan> = {}
  readonly planForm = this.#formBuilder.group({
    code: this.#formBuilder.nonNullable.control('', Validators.required),
    name: this.#formBuilder.nonNullable.control('', Validators.required),
    level: this.#formBuilder.nonNullable.control(0, [
      Validators.required,
      Validators.min(0),
      Validators.pattern(/^\d+$/)
    ]),
    status: this.#formBuilder.nonNullable.control<MembershipPlanStatusEnum>(
      MembershipPlanStatusEnum.Active,
      Validators.required
    ),
    isDefault: this.#formBuilder.nonNullable.control(false),
    includedPoints: new FormControl<number | null>(1000, Validators.min(0)),
    unlimited: this.#formBuilder.nonNullable.control(false),
    description: this.#formBuilder.nonNullable.control(''),
    allowAllModels: this.#formBuilder.nonNullable.control(true)
  })
  readonly memberFilterForm = this.#formBuilder.nonNullable.group({
    search: '',
    status: this.#formBuilder.nonNullable.control<MembershipAdminUserStatusEnum | ''>(''),
    planId: '',
    expiringBefore: this.#formBuilder.control<Date | null>(null)
  })
  readonly bulkActionForm = this.#formBuilder.nonNullable.group({
    action: this.#formBuilder.nonNullable.control<MembershipBulkActionEnum>(MembershipBulkActionEnum.Assign),
    planId: '',
    renewalMode: this.#formBuilder.nonNullable.control<MembershipRenewalModeEnum>(MembershipRenewalModeEnum.Auto),
    note: ''
  })
  allowedModels: IMembershipAllowedModel[] = []
  modelMultipliers: IMembershipModelMultiplier[] = []
  rateLimits: IMembershipRateLimit[] = []
  migrationTargetPlanId = ''

  ngOnInit() {
    this.load()
  }

  setActiveTab(tab: MembershipAdminTab) {
    this.activeTab.set(tab)
  }

  load() {
    this.loading.set(true)
    forkJoin({
      status: this.#membership.getScopeStatus(),
      plans: this.#membership.getPlans(),
      models: this.#membership.getModelOptions()
    }).subscribe({
      next: ({ status, plans, models }) => {
        const editablePlans = plans.filter((plan) => !plan.catalogSourcePlanId)
        this.scopeStatus.set(status)
        this.plans.set(editablePlans)
        this.modelOptions.set(this.toModelOptions(models))
        const selectedPlanId = this.selectedPlanId()
        if (!selectedPlanId || !editablePlans.some((plan) => plan.id === selectedPlanId)) {
          this.selectedPlanId.set(editablePlans.find((plan) => plan.isDefault)?.id ?? editablePlans[0]?.id ?? null)
        }
        this.loadPlanMembers(this.selectedPlanId())
        this.loadAdminMembers()
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
          this.#translate.instant('XP.Membership.InitializeSuccess', {
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
    this.draft = {}
    this.resetPlanForm()
    this.allowedModels = []
    this.modelMultipliers = []
    this.rateLimits = []
    this.selectedPlanId.set(null)
    this.planMembers.set([])
    this.migrationTargetPlanId = ''
    this.editing.set(true)
  }

  edit(plan: IMembershipPlan) {
    this.draft = { id: plan.id }
    this.planForm.reset({
      code: plan.code,
      name: plan.name,
      level: plan.level,
      status: plan.status,
      isDefault: !!plan.isDefault,
      includedPoints: plan.includedPoints ?? 1000,
      unlimited: plan.includedPoints === null,
      description: plan.description ?? '',
      allowAllModels: !(plan.allowedModels ?? []).length
    })
    this.allowedModels = (plan.allowedModels ?? []).map((item) => ({ ...item }))
    this.modelMultipliers = (plan.modelMultipliers ?? []).map((item) => ({ ...item }))
    this.rateLimits = (plan.rateLimits ?? []).map((item) => ({ ...item }))
    this.includeStoredModelOptions()
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
    if (this.planForm.invalid) {
      this.planForm.markAllAsTouched()
      return
    }
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

  async archive(plan: IMembershipPlan) {
    if (!plan.id) {
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.Membership.ArchivePlanConfirmTitle', {
          Default: 'Archive membership plan?'
        }),
        description: this.#translate.instant('XP.Membership.ArchivePlanConfirmDescription', {
          Default: 'Archive plan "{{name}}"? It will no longer be available for new assignments.',
          name: plan.name
        }),
        actionText: this.#translate.instant('XP.Membership.ArchivePlan', { Default: 'Archive' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
        destructive: true
      })
    )
    if (!confirmed) {
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

  async deletePlan(plan: IMembershipPlan) {
    if (!plan.id || plan.status !== MembershipPlanStatusEnum.Archived) {
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.Membership.DeletePlan', { Default: 'Delete plan' }),
        description: this.#translate.instant('XP.Membership.DeletePlanConfirm', {
          Default: 'Delete archived plan "{{name}}"? This cannot be undone.',
          name: plan.name
        }),
        actionText: this.#translate.instant('XP.ACTIONS.Delete', { Default: 'Delete' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
        destructive: true
      })
    )
    if (!confirmed) {
      return
    }

    this.loading.set(true)
    try {
      await firstValueFrom(this.#membership.deletePlan(plan.id))
      this.#toastr.success('XP.Membership.DeletePlanSuccess', { Default: 'Plan deleted.' })
      this.load()
    } catch (error) {
      this.loading.set(false)
      this.#toastr.error(getErrorMessage(error))
    }
  }

  pointsLabel(points?: number | null) {
    return points === null
      ? this.#translate.instant('XP.Membership.Unlimited', { Default: 'Unlimited' })
      : new Intl.NumberFormat(this.#translate.currentLang || this.#translate.getDefaultLang() || 'en', {
          maximumFractionDigits: 2
        }).format(points ?? 0)
  }

  scopeDefaultPlanLabel(status: IMembershipScopeStatus | null) {
    if (!status?.defaultPlan) {
      return this.#translate.instant('XP.Membership.NoDefaultPlan', { Default: 'No default plan' })
    }
    return `${status.defaultPlan.name} · ${this.pointsLabel(status.defaultPlan.includedPoints)}`
  }

  scopeStatusLabel(status: IMembershipScopeStatus | null) {
    if (!status) {
      return this.#translate.instant('XP.KEY_WORDS.Loading', { Default: 'Loading...' })
    }
    if (status.initialized) {
      return this.#translate.instant('XP.Membership.ScopeInitialized', { Default: 'Initialized' })
    }
    if (status.needsRepair) {
      return this.#translate.instant('XP.Membership.ScopeNeedsRepair', { Default: 'Needs repair' })
    }
    return this.#translate.instant('XP.Membership.ScopeNotInitialized', { Default: 'Not initialized' })
  }

  setDraftUnlimited(enabled: boolean) {
    this.planForm.patchValue({
      unlimited: enabled,
      includedPoints: enabled ? null : (this.planForm.controls.includedPoints.value ?? 1000)
    })
  }

  selectPlan(plan: IMembershipPlan) {
    this.selectedPlanId.set(plan.id)
    this.migrationTargetPlanId = ''
    this.loadPlanMembers(plan.id, 0)
    if (this.editing()) {
      this.edit(plan)
    }
  }

  loadPlanMembers(
    planId?: string | null,
    pageIndex = this.planMemberPageIndex(),
    pageSize = this.planMemberPageSize()
  ) {
    const loadSequence = ++this.#planMemberLoadSequence
    if (!planId) {
      this.planMembers.set([])
      this.planMemberCount.set(0)
      this.planMemberPageIndex.set(0)
      this.planMembersLoading.set(false)
      return
    }
    this.planMembersLoading.set(true)
    this.#membership
      .getAdminUsers({
        planId,
        take: pageSize,
        skip: pageIndex * pageSize
      })
      .subscribe({
        next: ({ items, total }) => {
          if (loadSequence !== this.#planMemberLoadSequence) {
            return
          }
          const memberCount = total ?? 0
          const lastPageIndex = Math.max(0, Math.ceil(memberCount / pageSize) - 1)
          if (memberCount > 0 && pageIndex > lastPageIndex) {
            this.loadPlanMembers(planId, lastPageIndex, pageSize)
            return
          }
          this.planMembers.set(items ?? [])
          this.planMemberCount.set(memberCount)
          this.planMemberPageIndex.set(memberCount ? pageIndex : 0)
          this.planMemberPageSize.set(pageSize)
          this.planMembersLoading.set(false)
        },
        error: (error) => {
          if (loadSequence !== this.#planMemberLoadSequence) {
            return
          }
          this.planMembersLoading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  onPlanMemberPage(event: ZardPageEvent) {
    this.loadPlanMembers(this.selectedPlanId(), event.pageIndex, event.pageSize)
  }

  loadAdminMembers() {
    const filters = this.memberFilterForm.getRawValue()
    this.adminMembersLoading.set(true)
    this.#membership
      .getAdminMembers({
        search: filters.search.trim() || undefined,
        status: filters.status || undefined,
        planId: filters.planId || undefined,
        expiringBefore: filters.expiringBefore ? format(filters.expiringBefore, 'yyyy-MM-dd') : undefined,
        take: this.adminMemberPageSize(),
        skip: this.adminMemberPageIndex() * this.adminMemberPageSize()
      })
      .subscribe({
        next: ({ items, total }) => {
          this.adminMembers.set(items ?? [])
          this.adminMemberCount.set(total ?? 0)
          this.adminMembersLoading.set(false)
          this.selectedUserIds.set(
            new Set([...this.selectedUserIds()].filter((id) => (items ?? []).some(({ user }) => user.id === id)))
          )
        },
        error: (error) => {
          this.adminMembersLoading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  applyMemberFilters() {
    this.adminMemberPageIndex.set(0)
    this.selectedUserIds.set(new Set())
    this.loadAdminMembers()
  }

  resetMemberFilters() {
    this.memberFilterForm.reset({
      search: '',
      status: '',
      planId: '',
      expiringBefore: null
    })
    this.applyMemberFilters()
  }

  onAdminMemberPage(event: ZardPageEvent) {
    this.adminMemberPageIndex.set(event.pageIndex)
    this.adminMemberPageSize.set(event.pageSize)
    this.selectedUserIds.set(new Set())
    this.loadAdminMembers()
  }

  toggleUserSelection(userId: string, selected: boolean) {
    const userIds = new Set(this.selectedUserIds())
    if (selected) {
      userIds.add(userId)
    } else {
      userIds.delete(userId)
    }
    this.selectedUserIds.set(userIds)
  }

  toggleVisibleUsers(selected: boolean) {
    const userIds = new Set(this.selectedUserIds())
    for (const { user } of this.adminMembers()) {
      if (selected) {
        userIds.add(user.id)
      } else {
        userIds.delete(user.id)
      }
    }
    this.selectedUserIds.set(userIds)
  }

  setMemberStatusFilter(value: string | number | Array<string | number>) {
    const status = String(Array.isArray(value) ? (value[0] ?? '') : value)
    const matched = Object.values(MembershipAdminUserStatusEnum).find((item) => item === status)
    this.memberFilterForm.controls.status.setValue(matched ?? '')
  }

  setBulkAction(value: string | number | Array<string | number>) {
    const action = String(Array.isArray(value) ? (value[0] ?? '') : value)
    const matched = Object.values(MembershipBulkActionEnum).find((item) => item === action)
    if (matched) {
      this.bulkActionForm.controls.action.setValue(matched)
    }
  }

  bulkActionRequiresPlan() {
    return this.bulkActionForm.controls.action.value === MembershipBulkActionEnum.Assign
  }

  async applyBulkAction() {
    const userIds = [...this.selectedUserIds()]
    const input = this.bulkActionForm.getRawValue()
    if (!userIds.length || (this.bulkActionRequiresPlan() && !input.planId)) {
      this.bulkActionForm.markAllAsTouched()
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.Membership.BulkActionConfirmTitle', {
          Default: 'Apply membership action?'
        }),
        description: this.#translate.instant('XP.Membership.BulkActionConfirmDescription', {
          Default: 'Apply "{{action}}" to {{count}} selected users?',
          action: input.action,
          count: userIds.length
        }),
        actionText: this.#translate.instant('XP.Membership.ApplyBulkAction', { Default: 'Apply action' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
        destructive: input.action === MembershipBulkActionEnum.Revoke
      })
    )
    if (!confirmed) {
      return
    }

    this.adminMembersLoading.set(true)
    this.#membership
      .applyBulkUserAction({
        userIds,
        action: input.action,
        planId: input.action === MembershipBulkActionEnum.Assign ? input.planId : undefined,
        renewalMode: input.action === MembershipBulkActionEnum.Assign ? input.renewalMode : undefined,
        note: input.note.trim() || null
      })
      .subscribe({
        next: ({ succeeded, failed }) => {
          this.selectedUserIds.set(new Set())
          if (failed.length) {
            this.#toastr.error(
              this.#translate.instant('XP.Membership.BulkActionPartialFailure', {
                Default: '{{succeeded}} succeeded and {{failed}} failed. {{message}}',
                succeeded,
                failed: failed.length,
                message: failed[0].message
              })
            )
          } else {
            this.#toastr.success('XP.Membership.BulkActionSuccess', {
              Default: `${succeeded} users updated.`,
              count: succeeded
            })
          }
          this.loadAdminMembers()
          this.loadPlanMembers(this.selectedPlanId())
        },
        error: (error) => {
          this.adminMembersLoading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  adminMemberLabel(member: IMembershipAdminUser) {
    return userLabel(member.user)
  }

  adminMemberStatus(member: IMembershipAdminUser) {
    return member.membership?.status ?? MembershipAdminUserStatusEnum.Unassigned
  }

  adminMemberRemainingPoints(member: IMembershipAdminUser) {
    const membership = member.membership
    if (!membership || membership.pointsGranted === null) {
      return null
    }
    return Math.max(0, membership.pointsGranted - membership.pointsUsed)
  }

  setMigrationTarget(value: string | number | Array<string | number>) {
    this.migrationTargetPlanId = String(Array.isArray(value) ? value[0] : value)
  }

  async reassignMembers(plan: IMembershipPlan) {
    if (!plan.id || !this.migrationTargetPlanId) {
      return
    }
    const targetPlan = this.plans().find((item) => item.id === this.migrationTargetPlanId)
    if (!targetPlan) {
      return
    }

    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.Membership.ReassignConfirmTitle', {
          Default: 'Reassign plan members?'
        }),
        description: this.#translate.instant('XP.Membership.ReassignConfirmDescription', {
          Default:
            'Move {{count}} members from "{{source}}" to "{{target}}"? Their current cycle and used cycle points will be reset.',
          count: this.planMemberCount(),
          source: plan.name,
          target: targetPlan.name
        }),
        actionText: this.#translate.instant('XP.Membership.ReassignMembers', { Default: 'Reassign members' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' }),
        destructive: true
      })
    )
    if (!confirmed) {
      return
    }

    this.loading.set(true)
    this.#membership.reassignPlanMembers(plan.id, { targetPlanId: this.migrationTargetPlanId }).subscribe({
      next: ({ updated }) => {
        this.#toastr.success('XP.Membership.ReassignSuccess', {
          Default: `${updated} members reassigned.`,
          count: updated
        })
        this.migrationTargetPlanId = ''
        this.loading.set(false)
        this.load()
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  memberLabel(member: IUserMembership) {
    return member.user ? userLabel(member.user) : member.userId
  }

  setDraftStatus(value: string | number | Array<string | number>) {
    const next = Array.isArray(value) ? value[0] : value
    const status = next as MembershipPlanStatusEnum
    this.planForm.controls.status.setValue(status)
    if (status === MembershipPlanStatusEnum.Archived) {
      this.planForm.controls.isDefault.setValue(false)
    }
  }

  setDraftDefault(isDefault: boolean) {
    this.planForm.controls.isDefault.setValue(
      this.planForm.controls.status.value === MembershipPlanStatusEnum.Archived ? false : isDefault
    )
  }

  modelMultiplierCount(plan: IMembershipPlan | null) {
    return plan?.modelMultipliers?.length ?? 0
  }

  allowedModelCount(plan: IMembershipPlan | null) {
    return plan?.allowedModels?.length ?? 0
  }

  rateLimitCount(plan: IMembershipPlan | null) {
    return plan?.rateLimits?.length ?? 0
  }

  setAllowAllModels(enabled: boolean) {
    this.planForm.controls.allowAllModels.setValue(enabled)
    if (enabled) {
      this.allowedModels = []
    }
  }

  allowedModelValues() {
    return this.allowedModels.map((item) => modelOptionValue(item.provider, item.model))
  }

  setAllowedModelValues(value: string | number | Array<string | number>) {
    this.allowedModels = selectionValues(value)
      .map(decodeModelOptionValue)
      .filter((item): item is IMembershipAllowedModel => !!item?.provider && !!item.model)
  }

  addModelMultiplier() {
    this.modelMultipliers = [...this.modelMultipliers, { provider: null, model: '*', multiplier: 1 }]
  }

  removeModelMultiplier(index: number) {
    this.modelMultipliers = this.modelMultipliers.filter((_, itemIndex) => itemIndex !== index)
  }

  modelMultiplierTargetValue(rule: IMembershipModelMultiplier) {
    return modelOptionValue(rule.provider?.trim() ?? '', rule.model?.trim() || '*')
  }

  setModelMultiplierTarget(index: number, value: string | number | Array<string | number>) {
    const target = decodeModelOptionValue(selectionValues(value)[0])
    if (!target) {
      return
    }
    this.modelMultipliers = this.modelMultipliers.map((rule, itemIndex) =>
      itemIndex === index ? { ...rule, provider: target.provider || null, model: target.model || '*' } : rule
    )
  }

  setModelMultiplierValue(index: number, event: Event) {
    const multiplier = Number((event.target as HTMLInputElement).value)
    this.modelMultipliers = this.modelMultipliers.map((rule, itemIndex) =>
      itemIndex === index ? { ...rule, multiplier } : rule
    )
  }

  addRateLimit() {
    this.rateLimits = [...this.rateLimits, { provider: null, model: '*', period: 'day', pointLimit: 1000 }]
  }

  removeRateLimit(index: number) {
    this.rateLimits = this.rateLimits.filter((_, itemIndex) => itemIndex !== index)
  }

  rateLimitTargetValue(rule: IMembershipRateLimit) {
    return modelOptionValue(rule.provider?.trim() ?? '', rule.model?.trim() || '*')
  }

  setRateLimitTarget(index: number, value: string | number | Array<string | number>) {
    const target = decodeModelOptionValue(selectionValues(value)[0])
    if (!target) {
      return
    }
    this.rateLimits = this.rateLimits.map((rule, itemIndex) =>
      itemIndex === index ? { ...rule, provider: target.provider || null, model: target.model || '*' } : rule
    )
  }

  setRateLimitPeriod(index: number, value: string | number | Array<string | number>) {
    const period = selectionValues(value)[0]
    const nextPeriod = MEMBERSHIP_RATE_LIMIT_PERIODS.find((item) => item === period)
    if (!nextPeriod) {
      return
    }
    this.rateLimits = this.rateLimits.map((rule, itemIndex) =>
      itemIndex === index ? { ...rule, period: nextPeriod } : rule
    )
  }

  setRateLimitValue(index: number, event: Event) {
    const pointLimit = Number((event.target as HTMLInputElement).value)
    this.rateLimits = this.rateLimits.map((rule, itemIndex) => (itemIndex === index ? { ...rule, pointLimit } : rule))
  }

  modelTargetLabel(option: MembershipModelOption) {
    let label: string
    if (!option.provider) {
      label = this.#translate.instant('XP.Membership.AllModels', { Default: 'All models' })
    } else if (option.model === '*') {
      label = `${option.provider} · ${this.#translate.instant('XP.Membership.AllProviderModels', {
        Default: 'All provider models'
      })}`
    } else {
      label = `${option.provider} · ${option.model}`
    }
    return option.available
      ? label
      : `${label} · ${this.#translate.instant('XP.Membership.HistoricalModelUnavailable', {
          Default: 'Removed / unavailable'
        })}`
  }

  private buildPayload(): Partial<IMembershipPlan> | null {
    const form = this.planForm.getRawValue()
    const allowAllModels = form.allowAllModels
    if (!form.unlimited && form.includedPoints === null) {
      this.#toastr.error(
        this.#translate.instant('XP.Membership.InvalidPoints', {
          Default: 'Points per period must be zero or greater.'
        })
      )
      return null
    }
    if (!allowAllModels && !this.allowedModels.length) {
      this.#toastr.error(
        this.#translate.instant('XP.Membership.SelectAtLeastOneModel', {
          Default: 'Select at least one model or allow all models.'
        })
      )
      return null
    }

    if (
      this.modelMultipliers.some((rule) => !Number.isFinite(Number(rule.multiplier)) || Number(rule.multiplier) < 0)
    ) {
      this.#toastr.error(
        this.#translate.instant('XP.Membership.InvalidMultiplier', {
          Default: 'Settlement amount multipliers must be zero or greater.'
        })
      )
      return null
    }

    if (this.rateLimits.some((rule) => !Number.isFinite(Number(rule.pointLimit)) || Number(rule.pointLimit) <= 0)) {
      this.#toastr.error(
        this.#translate.instant('XP.Membership.InvalidRateLimit', {
          Default: 'Usage limits must be greater than zero.'
        })
      )
      return null
    }

    return {
      code: form.code,
      name: form.name,
      level: Number(form.level),
      status: form.status,
      isDefault: form.isDefault,
      period: MembershipPeriodEnum.Monthly,
      includedPoints: form.unlimited ? null : Number(form.includedPoints ?? 0),
      description: form.description,
      allowedModels: allowAllModels ? [] : this.allowedModels.map((item) => ({ ...item })),
      modelMultipliers: [...this.modelMultipliers]
        .sort((left, right) => modelRuleSpecificity(right) - modelRuleSpecificity(left))
        .map((item) => ({ ...item, multiplier: Number(item.multiplier) })),
      rateLimits: this.rateLimits.map((item) => ({ ...item, pointLimit: Number(item.pointLimit) }))
    }
  }

  private resetPlanForm() {
    this.planForm.reset({
      code: '',
      name: '',
      level: 0,
      status: MembershipPlanStatusEnum.Active,
      isDefault: false,
      includedPoints: 1000,
      unlimited: false,
      description: '',
      allowAllModels: true
    })
  }

  private toModelOptions(copilots: ICopilotWithProvider[]): MembershipModelOption[] {
    const options = new Map<string, MembershipModelOption>()
    for (const copilot of copilots) {
      const provider = copilot.providerWithModels?.provider?.trim()
      if (!provider) {
        continue
      }
      addModelOption(options, provider, '*', true)
      for (const model of copilot.providerWithModels.models ?? []) {
        const modelName = model.model?.trim()
        if (modelName) {
          addModelOption(options, provider, modelName, true)
        }
      }
    }
    return sortModelOptions(Array.from(options.values()))
  }

  private includeStoredModelOptions() {
    const options = new Map(this.modelOptions().map((option) => [option.value, option]))
    const rules = [...this.allowedModels, ...this.modelMultipliers, ...this.rateLimits]
    for (const rule of rules) {
      const provider = rule.provider?.trim() ?? ''
      const model = rule.model?.trim() || '*'
      if (provider || model !== '*') {
        addModelOption(options, provider, model, false)
      }
    }
    this.modelOptions.set(sortModelOptions(Array.from(options.values())))
  }
}

function modelOptionValue(provider: string, model: string) {
  return `${encodeURIComponent(provider)}|${encodeURIComponent(model)}`
}

function decodeModelOptionValue(value?: string): IMembershipAllowedModel | null {
  if (!value) {
    return null
  }
  const separatorIndex = value.indexOf('|')
  if (separatorIndex < 0) {
    return null
  }
  try {
    return {
      provider: decodeURIComponent(value.slice(0, separatorIndex)),
      model: decodeURIComponent(value.slice(separatorIndex + 1))
    }
  } catch {
    return null
  }
}

function selectionValues(value: string | number | Array<string | number>) {
  return (Array.isArray(value) ? value : [value]).map(String)
}

function addModelOption(
  options: Map<string, MembershipModelOption>,
  provider: string,
  model: string,
  available: boolean
) {
  const value = modelOptionValue(provider, model)
  if (!options.has(value)) {
    options.set(value, { value, provider, model, available })
  }
}

function sortModelOptions(options: MembershipModelOption[]) {
  return options.sort(
    (left, right) =>
      left.provider.localeCompare(right.provider) ||
      (left.model === '*' ? -1 : right.model === '*' ? 1 : left.model.localeCompare(right.model))
  )
}

function modelRuleSpecificity(rule: IMembershipModelMultiplier) {
  return (rule.provider ? 1 : 0) + (rule.model && rule.model !== '*' ? 2 : 0)
}
