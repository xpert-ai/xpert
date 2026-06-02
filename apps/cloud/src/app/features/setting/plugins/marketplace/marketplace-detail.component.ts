import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { TPluginMarketplaceContribution, TPluginMarketplaceOperation, TPluginWithDownloads } from '../types'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, NgmI18nPipe, IconComponent],
  selector: 'xp-plugin-marketplace-detail',
  templateUrl: './marketplace-detail.component.html',
  styleUrls: ['./marketplace-detail.component.scss']
})
export class PluginMarketplaceDetailComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ plugin: TPluginWithDownloads }>(DIALOG_DATA)

  readonly plugin = signal(this.#data.plugin)
  readonly contents = computed(() => this.plugin()?.contributions ?? [])
  readonly selectedApp = signal<TPluginMarketplaceContribution | null>(
    this.#data.plugin?.contributions?.find((content) => content.type === 'app') ?? null
  )
  readonly operationGroups: Array<'read' | 'write' | 'admin'> = ['read', 'write', 'admin']

  close() {
    this.#dialogRef.close()
  }

  selectApp(content: TPluginMarketplaceContribution) {
    if (content.type === 'app') {
      this.selectedApp.set(content)
    }
  }

  contentTypeIcon(type: string) {
    switch (type) {
      case 'app':
        return 'ri-apps-2-line'
      case 'view':
        return 'ri-layout-4-line'
      case 'feature':
        return 'ri-sparkling-2-line'
      case 'tool':
        return 'ri-tools-line'
      default:
        return 'ri-puzzle-2-line'
    }
  }

  operations(access: string): TPluginMarketplaceOperation[] {
    return (this.selectedApp()?.operations ?? []).filter((operation) => operation.access === access)
  }

  operationCount() {
    return this.selectedApp()?.operations?.length ?? 0
  }
}
