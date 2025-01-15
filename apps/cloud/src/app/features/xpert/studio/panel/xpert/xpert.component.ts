import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getErrorMessage,
  injectToastr,
  IXpert,
  TXpertTeamNode,
  XpertService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioPanelComponent } from '../panel.component'

@Component({
  selector: 'xpert-studio-panel-xpert',
  templateUrl: './xpert.component.html',
  styleUrls: ['./xpert.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatTooltipModule,
    TranslateModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    NgmSpinComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelXpertComponent {
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly xpertService = inject(XpertService)
  readonly studioService = inject(XpertStudioApiService)
  readonly #toastr = injectToastr()

  readonly node = input<TXpertTeamNode>()
  readonly xpert = computed(() => this.node().entity as IXpert)
  readonly xpertId = computed(() => this.xpert()?.id)

  readonly copilotModel = computed(() => this.xpert()?.copilotModel)

  readonly loading = signal(false)

  refresh() {
    this.loading.set(true)
    this.xpertService
      .getOneById(this.xpertId(), { relations: ['copilotModel', 'agent', 'agent.copilotModel'] })
      .subscribe({
        next: (xpert) => {
          this.loading.set(false)
          this.studioService.updateXpert(this.xpertId(), xpert)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  closePanel() {
    this.panelComponent.close()
  }
}
