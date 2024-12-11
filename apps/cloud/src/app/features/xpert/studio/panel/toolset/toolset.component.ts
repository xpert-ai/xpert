import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertToolset, TXpertTeamNode, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { uniq } from 'lodash-es'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { XpertToolTestComponent } from '../../../tools'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'

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
    NgmDensityDirective
  ]
})
export class XpertStudioPanelToolsetComponent {
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly toolsetService = inject(XpertToolsetService)

  readonly node = input<TXpertTeamNode>()
  readonly toolsetId = computed(() => this.node()?.key)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)

  readonly toolset = derivedAsync(
    () => (this.toolsetId() ? this.toolsetService.getOneById(this.toolsetId(), { relations: ['tools'] }) : of(null)),
    { initialValue: this.node()?.entity as IXpertToolset }
  )

  readonly tools = computed(() =>
    this.toolset()
      ?.tools.filter((_) => _.enabled)
      .reverse()
  )

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

  closePanel() {
    this.panelComponent.close()
  }
}
