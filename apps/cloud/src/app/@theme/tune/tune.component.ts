import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatSliderModule } from '@angular/material/slider'
import { MatTabsModule } from '@angular/material/tabs'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgFilterPipeModule } from '@metad/core'
import { ButtonGroupDirective, DensityDirective, NgmDSCacheService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { AgentStatus, AgentStatusEnum } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { environment } from 'apps/cloud/src/environments/environment'
import { Observable, of } from 'rxjs'
import { AbstractAgent, LocalAgent, ServerSocketAgent, Store, ToastrService } from '../../@core'
import { CdkMenuModule } from '@angular/cdk/menu'

@Component({
  standalone: true,
  selector: 'pac-tune',
  templateUrl: 'tune.component.html',
  styleUrl: 'tune.component.scss',
  host: {
    class: 'pac-tune'
  },
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatIconModule,
    MatTooltipModule,
    MatButtonModule,
    MatTabsModule,
    MatListModule,
    MatSliderModule,
    MatProgressBarModule,
    ButtonGroupDirective,
    DensityDirective,
    NgFilterPipeModule
  ]
})
export class TuneComponent {
  enableLocalAgent = environment.enableLocalAgent
  AgentStatusEnum = AgentStatusEnum

  readonly toastrService = inject(ToastrService)
  readonly localAgent? = inject(LocalAgent, { optional: true })
  readonly wasmAgentService = inject(WasmAgentService)
  readonly serverAgent? = inject(ServerSocketAgent, { optional: true })
  readonly cacheService = inject(NgmDSCacheService, {optional: true})
  readonly store = inject(Store)

  get cacheLevel() {
    return this.cacheService?.getCacheLevel()
  }
  set cacheLevel(value) {
    this.cacheService?.changeCacheLevel(value)
    this.store.cacheLevel = value
  }

  public readonly localAgentStatus = toSignal<AgentStatus>(
    (this.localAgent?.selectStatus() as Observable<AgentStatus>) ?? of({ status: AgentStatusEnum.OFFLINE })
  )
  public readonly localStatus = computed(() => {
    if (this.localAgentStatus() && typeof this.localAgentStatus() !== 'string') {
      return {
        status: this.localAgentStatus().status,
        icon: agentStatusIcon(this.localAgentStatus().status)
      }
    }

    return null
  })

  public readonly wasmAgentStatus = toSignal<AgentStatus>(
    this.wasmAgentService.selectStatus() as Observable<AgentStatus>
  )
  public readonly wasmStatus = computed(() => {
    if (this.wasmAgentStatus() && typeof this.wasmAgentStatus() !== 'string') {
      return {
        status: this.wasmAgentStatus().status,
        icon: agentStatusIcon(this.wasmAgentStatus().status)
      }
    }

    return null
  })

  readonly progress = computed(() =>
    this.serverAgent?.bufferSize() > 0
      ? Math.floor((this.serverAgent.completeSize() / this.serverAgent.bufferSize()) * 100)
      : 100
  )

  readonly unclosedRequests = this.serverAgent?.unclosedRequests

  // constructor() {
  //   if (this.store.cacheLevel !== null && this.cacheService?.getCacheLevel() !== this.store.cacheLevel) {
  //     this.cacheService?.changeCacheLevel(this.store.cacheLevel)
  //   }
  // }

  tryConnectLocalAgent() {
    this.localAgent?.connect()
  }

  async deleteAuth(service: AbstractAgent, id: string) {
    await service.deleteAuthentication(id)
  }

  cacheLevelFormatter(value: number): string {
    switch (value) {
      case 0:
        return 'NO'
      case 1:
        return 'Metadata'
      case 2:
        return 'Members'
      case 3:
        return 'Query'
      case 4:
        return 'Others'
      default:
        return 'All'
    }
  }

  clearCache() {
    this.cacheService.clearAllCache()
    this.toastrService.success('PAC.ACTIONS.CLEAR_CACHE')
  }

  valueIsNotNil(item) {
    return !!item.value
  }
}

function agentStatusIcon(status: AgentStatusEnum) {
  let icon = '🔘'
  switch (status) {
    case AgentStatusEnum.ERROR:
      icon = '🔴'
      break
    case AgentStatusEnum.ONLINE:
      icon = '🟢'
      break
    default:
      icon = '🟡'
  }

  return icon
}
