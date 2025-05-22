import { CdkMenuModule } from '@angular/cdk/menu'
import { AsyncPipe } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { OverlayAnimations } from '@metad/core'
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
import { XpertParametersCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { uniq } from 'lodash-es'
import { BehaviorSubject, map, shareReplay, startWith, switchMap } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { NgmDensityDirective } from '@metad/ocap-angular/core'

@Component({
  selector: 'xpert-studio-panel-xpert',
  templateUrl: './xpert.component.html',
  styleUrls: ['./xpert.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    FormsModule,
    MatTooltipModule,
    MatSlideToggleModule,
    TranslateModule,
    CdkMenuModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertParametersCardComponent,
    NgmSpinComponent,
    NgmDensityDirective
  ],
  host: {
    tabindex: '-1'
  },
  animations: [...OverlayAnimations]
})
export class XpertStudioPanelXpertComponent {
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly xpertService = inject(XpertService)
  readonly studioService = inject(XpertStudioApiService)
  readonly #toastr = injectToastr()

  readonly node = input<TXpertTeamNode>()
  readonly team = computed(() => this.studioService.viewModel()?.team)

  // Xpert
  readonly xpert = computed(() => this.node().entity as IXpert)
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly primaryAgent = computed(() => this.xpert()?.agent)
  readonly parameters = computed(() => this.primaryAgent()?.parameters)
  readonly copilotModel = computed(() => this.xpert()?.copilotModel)

  // Team
  readonly agentConfig = computed(() => this.team()?.agentConfig)
  readonly disableOutput = computed(() => this.agentConfig()?.disableOutputs?.includes(this.xpertId()))

  readonly loading = signal(false)

  // Diagram of agents
  readonly refreshDiagram$ = new BehaviorSubject<void>(null)
  readonly diagram$ = this.refreshDiagram$.pipe(
    switchMap(() => this.xpertService.getDiagram(this.xpert().id).pipe(startWith(null))),
    map((imageBlob) => (imageBlob ? URL.createObjectURL(imageBlob) : null)),
    shareReplay(1)
  )

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

  updateDisableOutput(value: boolean) {
    const name = this.xpertId()
    const disableOutputs = value
      ? uniq([...(this.agentConfig()?.disableOutputs ?? []), name])
      : (this.agentConfig()?.disableOutputs?.filter((_) => _ !== name) ?? [])
    this.xpertStudioComponent.updateXpertAgentConfig({ disableOutputs })
  }

  edit() {
    window.open(['/xpert', this.xpertId() ,'agents'].join('/'), '_blank')
  }

  closePanel() {
    this.panelComponent.close()
  }
}
