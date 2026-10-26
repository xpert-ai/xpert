import { A11yModule } from '@angular/cdk/a11y'
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { AIPermissionsEnum, IMembershipMe, MembershipStatusEnum } from '@xpert-ai/contracts'
import { ZardTooltipDirective } from '@xpert-ai/headless-ui'
import { scan, Subscription, take, timeout } from 'rxjs'
import { MembershipService } from '../../@core/services/membership.service'
import { Store } from '../../@core/state'

let nextMembershipPanelId = 0

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-membership',
  imports: [CommonModule, A11yModule, OverlayModule, RouterLink, TranslateModule, ZardTooltipDirective],
  templateUrl: './cloud-sidebar-membership.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' }
})
export class CloudSidebarMembershipComponent {
  readonly collapsed = input(false)
  readonly id = `sidebar-membership-${++nextMembershipPanelId}`
  readonly open = signal(false)
  readonly account = signal<IMembershipMe | null>(null)
  readonly state = signal<'loading' | 'ready' | 'error'>('loading')
  readonly positions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 8 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 }
  ]

  private readonly store = inject(Store)
  private readonly membership = inject(MembershipService)
  private readonly translate = inject(TranslateService)
  private readonly user = toSignal(this.store.user$, { initialValue: this.store.user })
  private readonly scope = toSignal(this.store.selectActiveScope(), { initialValue: this.store.activeScope })
  private readonly organization = toSignal(this.store.selectOrganizationId())
  private readonly permissions = toSignal(this.store.userRolePermissions$)
  private readonly language = toSignal(this.translate.onLangChange)
  private readonly membershipRevision = toSignal(this.membership.membershipStateChanges$.pipe(scan((n) => n + 1, 0)))
  private request?: Subscription
  private generation = 0
  private loadedAt = 0

  readonly permitted = computed(() => {
    this.permissions()
    return !!this.user()?.id && this.store.hasPermission(AIPermissionsEnum.MEMBERSHIP_USE)
  })
  private readonly identity = computed(() =>
    JSON.stringify([this.user()?.id, this.user()?.tenantId, this.scope().level, this.organization(), this.permitted()])
  )

  readonly activePlan = computed(() => {
    const account = this.account()
    return !!account && !account.personalPointsOnly && account.membership?.status === MembershipStatusEnum.Active
  })
  readonly unlimited = computed(() => this.activePlan() && this.account()?.pointsGranted === null)
  readonly remainingPercent = computed(() => {
    const account = this.account()
    if (!this.activePlan() || account.pointsGranted === null || account.pointsRemaining === null) return null
    if (account.pointsGranted <= 0) return 0
    return Math.min(100, Math.max(0, Math.round((account.pointsRemaining / account.pointsGranted) * 100)))
  })
  readonly ringPercent = computed(() =>
    this.state() === 'ready' ? (this.unlimited() ? 100 : (this.remainingPercent() ?? 0)) : 0
  )
  readonly planName = computed(() => {
    this.language()
    return this.account()?.plan?.name || this.translate.instant('XP.Sidebar.Membership.NoPlan')
  })
  readonly summary = computed(() => {
    this.language()
    if (this.state() === 'loading') return this.translate.instant('XP.Sidebar.Membership.Loading')
    if (this.state() === 'error') return this.translate.instant('XP.Sidebar.Membership.Unavailable')
    if (this.unlimited()) return this.translate.instant('XP.Sidebar.Membership.Unlimited')
    const percent = this.remainingPercent()
    if (percent !== null) return this.translate.instant('XP.Sidebar.Membership.CycleRemaining', { percent })
    if (this.account()?.personalPointsOnly) return this.translate.instant('XP.Membership.PersonalPoints')
    const status = this.account()?.membership?.status
    return status ? this.translate.instant('XP.Membership.MemberStatuses.' + status) : this.planName()
  })

  constructor() {
    effect((onCleanup) => {
      this.identity()
      this.membershipRevision()
      untracked(() => {
        this.generation++
        this.request?.unsubscribe()
        this.account.set(null)
        this.open.set(false)
        this.loadedAt = 0
        this.state.set('loading')
        this.refresh(true)
      })
      onCleanup(() => {
        this.generation++
        this.request?.unsubscribe()
      })
    })
  }

  refresh(force = false) {
    if (!this.permitted() || (this.request && !this.request.closed)) return
    if (!force && this.loadedAt && Date.now() - this.loadedAt < 30000) return
    const generation = ++this.generation
    this.state.set('loading')
    this.request = this.membership
      .getMe()
      .pipe(take(1), timeout(15000))
      .subscribe({
        next: (account) => {
          if (generation !== this.generation) return
          this.account.set(account)
          this.loadedAt = Date.now()
          this.state.set('ready')
        },
        error: () => {
          if (generation !== this.generation) return
          this.account.set(null)
          this.state.set('error')
        }
      })
  }

  toggle() {
    this.open.update((value) => !value)
    if (this.open()) this.refresh(true)
  }

  onOverlayKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    this.open.set(false)
  }

  onOutsideClick(event: MouseEvent, trigger: HTMLElement) {
    if (event.target instanceof Node && trigger.contains(event.target)) return
    this.open.set(false)
  }
}
