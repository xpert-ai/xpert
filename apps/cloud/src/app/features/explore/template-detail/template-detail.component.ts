import { injectLanguage } from '@cloud/app/@core/providers/translate'
import { Dialog } from '@angular/cdk/dialog'
import { BreakpointObserver } from '@angular/cdk/layout'
import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { AssistantTemplateOverview } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardTabsImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, XpertTemplateService } from '@cloud/app/@core'
import { type BlankXpertWizardResult, XpertNewBlankComponent } from '../../xpert/xpert'
import { createAgentTemplateWizardData } from '../agents/agent-template-wizard'
import { ExploreScopeService } from '../explore-scope.service'
import { ExploreScopeComponent } from '../explore-scope.component'

@Component({
  standalone: true,
  imports: [RouterLink, TranslateModule, ZardButtonComponent, ...ZardTabsImports, ExploreScopeComponent],
  templateUrl: './template-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-full bg-background text-foreground' }
})
export class TemplateDetailComponent {
  readonly language = injectLanguage()
  readonly scope = inject(ExploreScopeService)
  readonly route = inject(ActivatedRoute)
  readonly router = inject(Router)
  readonly api = inject(XpertTemplateService)
  readonly dialog = inject(Dialog)
  readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap })
  readonly wide = toSignal(inject(BreakpointObserver).observe('(min-width: 768px)'))
  readonly detail = signal<AssistantTemplateOverview | null>(null)
  readonly loading = signal(false)
  readonly error = signal('')
  private generation = 0

  constructor() {
    effect(() => {
      this.params()
      this.scope.key()
      this.language()
      untracked(() => void this.load())
    })
  }
  openDesktop() {
    const id = this.params().get('id')
    if (id)
      window.location.href = `xpert://template/import?origin=${encodeURIComponent(location.origin)}&id=${encodeURIComponent(id)}`
  }
  async load() {
    const generation = ++this.generation
    this.loading.set(true)
    this.error.set('')
    this.detail.set(null)
    try {
      const detail = await firstValueFrom(this.api.getOverview(this.params().get('templateId')))
      if (generation === this.generation) this.detail.set(detail)
    } catch (error) {
      if (generation === this.generation) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.generation) this.loading.set(false)
    }
  }
  async install() {
    let detail = this.detail()
    if (!detail) return
    if (this.scope.isTenant()) {
      if (!(await this.scope.choose(true))) return
      await this.load()
      detail = this.detail()
      if (!detail) return
    }
    if (detail.application) {
      await this.router.navigate(['/explore/apps', detail.application.appName], {
        queryParams: { plugin: detail.application.pluginName, setup: 1 }
      })
      return
    }
    this.dialog
      .open<BlankXpertWizardResult>(XpertNewBlankComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        width: '1360px',
        maxWidth: 'calc(100vw - 32px)',
        disableClose: true,
        data: createAgentTemplateWizardData(detail.id, null)
      })
      .closed.subscribe((result) => {
        if (result?.xpert?.id) void this.router.navigate(['/xpert/x', result.xpert.id])
      })
  }
}
