import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective, ZardSelectImports, ZardSelectValue } from '@xpert-ai/headless-ui'
import type { IXpert, NodeOf } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, XpertAPIService } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { attachExternalExpert, delegationAgents, detachExternalExpert } from './settings-delegation.utils'

@Component({
  selector: 'xp-settings-external-experts',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    EmojiAvatarComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-external-experts.component.html'
})
export class SettingsExternalExpertsComponent {
  readonly editor = inject(XpertSettingsEditor)
  private readonly api = inject(XpertAPIService)
  private readonly translate = inject(TranslateService)
  private readonly destroyRef = inject(DestroyRef)
  readonly loading = signal(false)
  readonly busy = signal(false)
  readonly error = signal<string | null>(null)
  readonly choosing = signal(false)
  readonly candidates = signal<IXpert[]>([])
  readonly query = signal('')
  readonly selected = signal<string | null>(null)
  readonly parentKey = signal(this.editor.source.draft().team.agent?.key ?? '')
  readonly agents = computed(() => delegationAgents(this.editor.source.draft()))
  readonly experts = computed(() =>
    this.editor.source.draft().nodes.filter((node): node is NodeOf<'xpert'> => node.type === 'xpert')
  )
  readonly available = computed(() => {
    const draft = this.editor.source.draft(),
      query = this.query().trim().toLowerCase()
    return this.candidates().filter(
      (expert) =>
        expert.id !== draft.team.id &&
        !(expert.name === draft.team.name && expert.workspaceId === draft.team.workspaceId) &&
        !this.experts().some((node) => node.entity.id === expert.id) &&
        (!query || `${expert.title ?? ''} ${expert.name} ${expert.description ?? ''}`.toLowerCase().includes(query))
    )
  })
  selectExpert(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') this.selected.set(value)
  }
  selectParent(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') this.parentKey.set(value)
  }
  callers(key: string) {
    const draft = this.editor.source.draft()
    return draft.connections
      .filter((edge) => edge.type === 'xpert' && edge.to === key)
      .map((edge) => this.agents().find((node) => node.key === edge.from)?.entity)
      .filter((agent) => !!agent)
      .map((agent) => agent.title || agent.name || agent.key)
      .join(', ')
  }
  async load() {
    const workspaceId = this.editor.source.draft().team.workspaceId
    this.choosing.set(true)
    this.error.set(null)
    if (!workspaceId) {
      this.error.set(this.translate.instant('XP.XpertSettings.Delegation.WorkspaceRequired'))
      return
    }
    this.loading.set(true)
    try {
      const items: IXpert[] = []
      for (let skip = 0; ; skip += 100) {
        const page = await firstValueFrom(
          this.api.getAllByWorkspace(workspaceId, { where: { latest: true }, take: 100, skip }, true)
        )
        if (this.destroyRef.destroyed) return
        items.push(...page.items)
        if (page.items.length < 100) break
      }
      this.candidates.set(items.filter((expert) => !!expert.version))
    } catch (error) {
      if (!this.destroyRef.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false)
    }
  }
  async add() {
    const candidate = this.available().find((expert) => expert.id === this.selected())
    if (!candidate || this.busy()) return
    this.busy.set(true)
    this.error.set(null)
    try {
      const expert = await firstValueFrom(this.api.getTeam(candidate.id, { relations: ['agent', 'copilotModel'] }))
      if (this.destroyRef.destroyed) return
      this.editor.source.update((draft) => attachExternalExpert(draft, expert, this.parentKey()))
      this.selected.set(null)
      this.choosing.set(false)
      await this.editor.save()
    } catch (error) {
      if (!this.destroyRef.destroyed) this.error.set(this.translate.instant(getErrorMessage(error)))
    } finally {
      if (!this.destroyRef.destroyed) this.busy.set(false)
    }
  }
  async remove(key: string) {
    if (this.busy()) return
    this.busy.set(true)
    this.error.set(null)
    try {
      this.editor.source.update((draft) => detachExternalExpert(draft, key))
      await this.editor.save()
    } finally {
      if (!this.destroyRef.destroyed) this.busy.set(false)
    }
  }
}
