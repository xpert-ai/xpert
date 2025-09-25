import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FConnectionComponent } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import { getEnabledTools, IXpertAgent, IXpertToolset, TXpertTeamConnection, TXpertTeamNode } from '@cloud/app/@core/types'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioApiService } from '../../domain'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, CdkMenuModule, CdkListboxModule],
  selector: 'xpert-studio-connection-menu',
  templateUrl: './connection-menu.component.html',
  styleUrls: ['./connection-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioConnectionMenuComponent {
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly connection = input<TXpertTeamConnection>()
  readonly connectionComponent = input<FConnectionComponent>()

  // States
  readonly agentKey = computed(() => (this.connection().type === 'toolset' ? this.connection().from : null))
  readonly toolsetId = computed(() => (this.connection().type === 'toolset' ? this.connection().to : null))

  readonly agentNode = computed(
    () =>
      this.studioService
        .viewModel()
        .nodes?.find((_) => _.type === 'agent' && _.key === this.agentKey()) as TXpertTeamNode & {
        type: 'agent'
        entity: IXpertAgent
      }
  )
  readonly toolsetNode = computed(
    () =>
      this.studioService
        .viewModel()
        .nodes?.find((_) => _.type === 'toolset' && _.key === this.toolsetId()) as TXpertTeamNode & {
        type: 'toolset'
        entity: IXpertToolset
      }
  )
  readonly positions = computed(() => this.toolsetNode()?.entity?.options?.toolPositions)
  // Toolset
  // Retrieve the latest information about the toolset
  readonly toolsetDetail = derivedAsync(() => {
    return this.toolsetId()
      ? this.studioService.getToolset(this.toolsetId()).toolset$.pipe(catchError((err) => of(null)))
      : of(null)
  })

  readonly toolsetName = computed(() => this.toolsetDetail()?.name)

  readonly tools = computed(() => getEnabledTools(this.toolsetDetail()))

  readonly #allTools = computed(() => this.tools()?.map((_) => _.name))

  readonly agent = computed(() => this.agentNode()?.entity)
  readonly availableTools = computed(
    () => {
      const availableTools = this.agent()?.options?.availableTools?.[this.toolsetName()] ?? []
      if (!availableTools.length) {
        return this.#allTools()
      }
      return availableTools.filter((name) => this.#allTools()?.find((_) => _ === name))
    }
  )

  readonly selectedAll = computed(() => this.#allTools()?.every((_) => this.availableTools().some((name) => name === _)))

  updateAvailableTools(tools: string[]) {
    const options = this.agent().options ?? {}
    this.studioService.updateXpertAgent(this.agentKey(), {
      options: {
        ...options,
        availableTools: {
          ...(options.availableTools ?? {}),
          [this.toolsetName()]: this.#allTools().every((_) => tools.some((name) => name === _)) ? [] : tools
        }
      }
    })
  }

  removeConnection() {
    const connection: FConnectionComponent = this.connectionComponent()
    this.studioService.removeConnection(connection.fOutputId, connection.fInputId)
  }
}
