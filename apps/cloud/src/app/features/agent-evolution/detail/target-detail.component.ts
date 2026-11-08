import { Dialog, type DialogRef } from '@angular/cdk/dialog'
import { JsonPipe } from '@angular/common'
import { Component, computed, effect, inject, signal, TemplateRef, viewChild, ViewContainerRef } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { type ActiveCapabilityPointer, type CapabilityVersion } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { injectActiveScope, injectOrganization } from '@cloud/app/@core/state'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { sameEvolutionScope } from '../agent-evolution.types'
import { loadAllEvolutionPages } from '../shared/evolution-pagination'
import { targetLabel } from '../targets/target-directory'
import { EvolutionBaselinePanelComponent } from './evolution-baseline-panel.component'

@Component({
  imports: [
    TranslateModule,
    JsonPipe,
    RouterLink,
    ZardButtonComponent,
    ...XpDialogFrameImports,
    EvolutionBaselinePanelComponent
  ],
  templateUrl: './target-detail.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground' }
})
export class EvolutionTargetDetailComponent {
  readonly p = 'XP.AgentEvolution.TargetDetail.'
  readonly facade = inject(AgentEvolutionFacade)
  private readonly route = inject(ActivatedRoute)
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap })
  readonly id = computed(() => this.params().get('resourceId') ?? '')
  readonly descriptor = computed(() => this.facade.dashboard().targets.find((target) => target.targetId === this.id()))
  private readonly i18n = inject(TranslateService)
  private readonly lang = toSignal(this.i18n.onLangChange)
  readonly name = computed(() => {
    this.lang()
    const d = this.descriptor()
    return d ? targetLabel(d, this.i18n.currentLang) : this.id()
  })
  private readonly scope = injectActiveScope()
  private readonly organization = injectOrganization()
  private readonly api = inject(AgentEvolutionApiService)
  private readonly extraVersions = signal<CapabilityVersion[]>([])
  readonly panel = viewChild(EvolutionBaselinePanelComponent)
  readonly inspection = computed(() => {
    const data = this.panel()?.data()
    return data?.targetId === this.id() ? data : null
  })
  private readonly pointers = computed(() =>
    this.facade.dashboard().pointers.filter((p) => p.targetId === this.id() && p.channel === 'production')
  )
  readonly production = computed(() => {
    this.lang()
    const org = this.organization()
    const current = this.inspection()?.current
    const versions = [...this.facade.dashboard().versions, ...this.extraVersions()]
    return this.pointers().map((pointer) => {
      const scope = pointer.scope
      const version =
        current?.version.versionId === pointer.activeVersionId
          ? current.version
          : versions.find((v) => v.targetId === pointer.targetId && v.versionId === pointer.activeVersionId)
      const place = scope.type === 'organization' && scope.key === org?.id ? org.name : scope.key
      const dimensions = Object.entries(scope.dimensions ?? {})
        .map(([k, v]) => k + '=' + v)
        .join(' · ')
      return { pointer, version, place, dimensions }
    })
  })
  readonly releaseCandidate = computed(() => {
    const s = this.scope()
    if (!('organizationId' in s)) return undefined
    const pointer = this.pointers().find((p) =>
      sameEvolutionScope(p.scope, { type: 'organization', key: s.organizationId })
    )
    if (!pointer?.releasePackageId) return undefined
    return this.facade
      .dashboard()
      .releases.find(
        (r) =>
          r.releasePackageId === pointer.releasePackageId &&
          r.targetId === pointer.targetId &&
          sameEvolutionScope(r.scope, pointer.scope) &&
          r.targetVersionId === pointer.activeVersionId
      )?.candidateId
  })
  private readonly formatter = computed(() => {
    this.lang()
    return new Intl.DateTimeFormat(this.i18n.currentLang, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    })
  })
  readonly timezone = computed(() => {
    this.lang()
    const zone = this.formatter().resolvedOptions().timeZone
    return (
      new Intl.DateTimeFormat(this.i18n.currentLang, { timeZone: zone, timeZoneName: 'longGeneric' })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value || zone
    )
  })
  formatDate(pointer: ActiveCapabilityPointer) {
    return this.formatter().format(new Date(pointer.updatedAt))
  }
  private readonly dialogs = inject(Dialog)
  private readonly container = inject(ViewContainerRef)
  private dialog?: DialogRef
  readonly technical = viewChild.required<TemplateRef<unknown>>('technical')
  openTechnical() {
    if (this.dialog) return
    this.dialog = this.dialogs.open(this.technical(), {
      viewContainerRef: this.container,
      width: '54rem',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: '86dvh',
      ariaLabel: this.i18n.instant(this.p + 'Technical'),
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
    this.dialog.closed.subscribe(() => {
      this.dialog = undefined
    })
  }
  closeTechnical() {
    this.dialog?.close()
  }
  constructor() {
    effect((cleanup) => {
      this.scope()
      this.id()
      cleanup(() => this.closeTechnical())
    })
    // The dashboard only carries the latest versions; an older active pointer must still resolve by its exact version ID.
    effect((cleanup) => {
      this.scope()
      const id = this.id(),
        cached = this.facade.dashboard().versions
      this.extraVersions.set([])
      if (!this.pointers().some((p) => !cached.some((v) => v.versionId === p.activeVersionId && v.targetId === id)))
        return
      let current = true
      cleanup(() => {
        current = false
      })
      void loadAllEvolutionPages((page) =>
        firstValueFrom(this.api.listCapabilityVersions({ targetId: id, page, pageSize: 100 }))
      )
        .then((items) => {
          if (current) this.extraVersions.set(items)
        })
        .catch(() => {
          /* The exact active version ID remains visible if metadata is unavailable. */
        })
    })
  }
}
