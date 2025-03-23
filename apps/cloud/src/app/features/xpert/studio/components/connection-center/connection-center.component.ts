import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgent, IXpertToolset, TXpertTeamConnection, TXpertTeamNode } from 'apps/cloud/src/app/@core/types'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioApiService } from '../../domain'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, CdkMenuModule, CdkListboxModule],
  selector: 'xpert-studio-connection-center',
  templateUrl: './connection-center.component.html',
  styleUrls: ['./connection-center.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioConnectionCenterComponent {
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly connection = input<TXpertTeamConnection>()

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
      ? this.studioService.getToolset(this.toolsetId()).pipe(catchError((err) => of(null)))
      : of(null)
  })
  readonly toolsetName = computed(() => this.toolsetDetail()?.name)

  readonly tools = computed(() => {
    const positions = this.positions()
    const tools = this.toolsetDetail()?.tools.filter((_) => _.enabled)

    return positions && tools
      ? tools.sort((a, b) => (positions[a.name] ?? Infinity) - (positions[b.name] ?? Infinity))
      : tools
  })

  readonly #allTools = computed(() => this.tools()?.map((_) => _.name))

  readonly agent = computed(() => this.agentNode()?.entity)
  readonly availableTools = computed(() => {
    return this.agent()?.options?.availableTools?.[this.toolsetName()] ?? []
  })

  readonly selectedAll = computed(() =>
    this.availableTools()?.length ?
    this.#allTools()?.every((_) => this.availableTools().some((name) => name === _)) : true
  )
}
