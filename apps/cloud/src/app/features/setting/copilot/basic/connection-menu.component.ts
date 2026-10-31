import { A11yModule } from '@angular/cdk/a11y'
import { NgClass } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ICopilot, ProviderModelCatalog } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardIconComponent,
  ZardMenuImports,
  ZardPopoverComponent,
  ZardPopoverDirective
} from '@xpert-ai/headless-ui'
import { Pencil, Power, SlidersHorizontal } from 'lucide-angular'
import { providerModelEnabled, providerModelRows } from '../../../../@shared/copilot/copilot-provider/provider-models'

type ConnectionState = 'enabled' | 'disabled' | 'invalid' | 'catalogError' | 'pending'

export function connectionState(connection: ICopilot, catalogError: boolean): ConnectionState {
  if (!connection.enabled) return 'disabled'
  if (connection.modelProvider?.isValid === false) return 'invalid'
  if (catalogError) return 'catalogError'
  if (connection.modelProvider?.options?.enabledModels?.length === 0) return 'pending'
  return 'enabled'
}

@Component({
  standalone: true,
  selector: 'xp-provider-connections',
  templateUrl: './connection-menu.component.html',
  imports: [
    A11yModule,
    NgClass,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardPopoverComponent,
    ZardPopoverDirective,
    ...ZardMenuImports
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0 max-w-full' }
})
export class ProviderConnectionsComponent {
  readonly connections = input.required<ICopilot[]>()
  readonly selectedId = input.required<string>()
  readonly catalogs = input<Record<string, ProviderModelCatalog>>({})
  readonly catalogErrors = input<ReadonlySet<string>>(new Set())
  readonly selected = output<string>()
  readonly edit = output<ICopilot>()
  readonly toggle = output<ICopilot>()
  readonly add = output<void>()
  readonly open = signal(false)
  readonly popover = viewChild(ZardPopoverDirective)
  readonly trigger = viewChild('connectionTrigger', { read: ElementRef<HTMLButtonElement> })
  readonly icons = { pencil: Pencil, power: Power, sliders: SlidersHorizontal }
  readonly stateClasses: Record<ConnectionState, string> = {
    enabled: 'text-text-success',
    disabled: 'text-muted-foreground',
    invalid: 'text-destructive',
    catalogError: 'text-text-warning',
    pending: 'text-muted-foreground'
  }
  readonly rows = computed(() =>
    this.connections().map((connection) => {
      const catalog = this.catalogs()[connection.id]
      return {
        connection,
        name: connection.name || `${connection.modelProvider?.providerName} · ${connection.id.slice(0, 8)}`,
        state: connectionState(connection, this.catalogErrors().has(connection.id)),
        count: catalog ? providerModelRows(catalog).filter((row) => providerModelEnabled(row, catalog)).length : null
      }
    })
  )
  readonly current = computed(() => this.rows().find((row) => row.connection.id === this.selectedId()))
  readonly titleId = computed(() => `provider-connections-${this.selectedId()}`)

  close() {
    this.popover()?.hide()
    this.trigger()?.nativeElement.focus({ preventScroll: true })
  }
  choose(id: string) {
    this.close()
    this.selected.emit(id)
  }
  editConnection(connection: ICopilot) {
    this.close()
    this.edit.emit(connection)
  }
  toggleConnection(connection: ICopilot) {
    this.close()
    this.toggle.emit(connection)
  }
  addConnection() {
    this.close()
    this.add.emit()
  }
}
