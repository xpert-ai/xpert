import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  IXpertToolset,
  TXpertTeamNode,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { uniq } from 'lodash-es'
import { XpertToolTestComponent } from '../../../tools'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'

@Component({
  selector: 'xpert-studio-panel-toolset',
  templateUrl: './toolset.component.html',
  styleUrls: ['./toolset.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    MatSlideToggleModule,
    MatTooltipModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    XpertToolTestComponent,
    NgmDensityDirective,
    NgmSpinComponent
  ]
})
export class XpertStudioPanelToolsetComponent {
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly toolsetService = inject(XpertToolsetService)
  readonly studioService = inject(XpertStudioApiService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly toolsetId = computed(() => this.node()?.key)
  readonly toolset = computed(() => this.node()?.entity as IXpertToolset)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly positions = computed(() => this.toolset()?.options?.toolPositions)

  readonly toolsetDetail = derivedAsync(() => {
    return this.toolsetId() ? this.studioService.getToolset(this.toolsetId()) : of(null)
  })

  readonly tools = computed(() => {
    const positions = this.positions()
    const tools = this.toolsetDetail()?.tools?.filter((_) => _.enabled)
    return positions && tools ? tools.sort((a, b) => (positions[a.name] ?? Infinity) - (positions[b.name] ?? Infinity))
      : tools
  })

  readonly loading = signal(false)

  refresh() {
    this.loading.set(true)
    this.toolsetService.getOneById(this.toolsetId()).subscribe({
      next: (toolset) => {
        this.loading.set(false)
        this.studioService.updateToolset(this.node().key, toolset)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  getSensitive(name: string) {
    return this.agentConfig()?.interruptBefore?.includes(name)
  }

  updateSensitive(name: string, value: boolean) {
    const interruptBefore = value
      ? uniq([...(this.agentConfig()?.interruptBefore ?? []), name])
      : (this.agentConfig()?.interruptBefore?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({
      interruptBefore
    })
  }

  isEnd(name: string) {
    return this.agentConfig()?.endNodes?.includes(name)
  }

  updateEnd(name: string, value: boolean) {
    const endNodes = value
      ? uniq([...(this.agentConfig()?.endNodes ?? []), name])
      : (this.agentConfig()?.endNodes?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({ endNodes })
  }

  closePanel() {
    this.panelComponent.close()
  }
}
