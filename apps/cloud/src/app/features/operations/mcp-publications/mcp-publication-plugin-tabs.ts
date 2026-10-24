import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type {
  IMcpPublication,
  IMcpPublicationCapability,
  McpPublicationConfiguration,
  McpPublicationConfigurationTab
} from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, injectToastr, McpPublicationService } from '../../../@core'
import { JSONSchemaFormComponent } from '../../../@shared/forms/json-schema-form/form.component'

type PluginTab = { key: string; configuration: McpPublicationConfigurationTab }

@Component({
  selector: 'xp-mcp-publication-plugin-tabs',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, XpI18nPipe, ZardButtonComponent, JSONSchemaFormComponent],
  templateUrl: './mcp-publication-plugin-tabs.html',
  host: { class: 'contents' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class McpPublicationPluginTabsComponent {
  readonly #publications = inject(McpPublicationService)
  readonly #toastr = injectToastr()
  readonly publication = input.required<IMcpPublication & { capabilities?: IMcpPublicationCapability[] }>()
  readonly active = input(false)
  readonly activate = output<void>()
  readonly reset = output<void>()
  readonly contentTemplate = viewChild.required<TemplateRef<unknown>>('content')
  readonly form = viewChild<JSONSchemaFormComponent>('configurationForm')
  readonly tabs = signal<PluginTab[]>([])
  readonly selectedKey = signal<string | null>(null)
  readonly selectedTab = computed(() => this.tabs().find(({ key }) => key === this.selectedKey()) ?? null)
  readonly configuration = signal<McpPublicationConfiguration | null>(null)
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly error = signal<string | null>(null)
  #loadSequence = 0
  #configurationSequence = 0

  constructor() {
    effect(() => {
      const publication = this.publication()
      untracked(() => {
        void this.loadTabs(publication.id)
      })
    })
  }

  async loadTabs(publicationId: string) {
    const sequence = ++this.#loadSequence
    ++this.#configurationSequence
    this.tabs.set([])
    this.configuration.set(null)
    this.loading.set(false)
    this.selectedKey.set(null)
    this.error.set(null)
    this.reset.emit()
    try {
      const configurations = await firstValueFrom(this.#publications.configurationTabs(publicationId))
      if (sequence !== this.#loadSequence) return
      this.tabs.set(
        configurations.map(
          (configuration): PluginTab => ({ key: `configuration:${configuration.toolsetId}`, configuration })
        )
      )
    } catch (error) {
      if (sequence === this.#loadSequence) this.error.set(getErrorMessage(error))
    }
  }

  async select(tab: PluginTab, reload = false) {
    if (!reload && this.selectedKey() === tab.key) {
      this.activate.emit()
      return
    }
    const sequence = ++this.#configurationSequence
    const publicationId = this.publication().id
    this.selectedKey.set(tab.key)
    this.configuration.set(null)
    this.loading.set(false)
    this.error.set(null)
    this.activate.emit()
    if (!tab.configuration.canEdit) return
    this.loading.set(true)
    try {
      const configuration = await firstValueFrom(
        this.#publications.sourceConfiguration(publicationId, tab.configuration.toolsetId)
      )
      if (sequence === this.#configurationSequence) this.configuration.set(configuration)
    } catch (error) {
      if (sequence === this.#configurationSequence) this.error.set(getErrorMessage(error))
    } finally {
      if (sequence === this.#configurationSequence) this.loading.set(false)
    }
  }

  updateValues(values: McpPublicationConfiguration['values']) {
    this.configuration.update((configuration) => (configuration ? { ...configuration, values } : null))
  }

  async save() {
    const tab = this.selectedTab()
    const configuration = this.configuration()
    if (!tab || !configuration || this.form()?.invalid || this.saving()) return
    const sequence = this.#configurationSequence
    this.saving.set(true)
    try {
      const saved = await firstValueFrom(
        this.#publications.updateSourceConfiguration(this.publication().id, tab.configuration.toolsetId, configuration)
      )
      if (sequence === this.#configurationSequence) {
        this.configuration.set(saved)
        this.#toastr.success('XP.McpPublication.ConfigurationSaved', { Default: 'Configuration saved' })
      }
    } catch (error) {
      if (sequence === this.#configurationSequence) this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }
}
