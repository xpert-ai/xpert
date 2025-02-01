import { CdkMenuModule } from '@angular/cdk/menu'
import { AsyncPipe } from '@angular/common'
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
import { XpertParametersCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { BehaviorSubject, map, shareReplay, startWith, switchMap } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioPanelComponent } from '../panel.component'
import { OverlayAnimations, SlideUpAnimation } from '@metad/core'

@Component({
  selector: 'xpert-studio-panel-xpert',
  templateUrl: './xpert.component.html',
  styleUrls: ['./xpert.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    MatTooltipModule,
    TranslateModule,
    CdkMenuModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertParametersCardComponent,
    NgmSpinComponent
  ],
  host: {
    tabindex: '-1'
  },
  animations: [...OverlayAnimations]
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
  readonly parameters = computed(() => this.xpert()?.agent?.parameters)

  readonly copilotModel = computed(() => this.xpert()?.copilotModel)

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

  closePanel() {
    this.panelComponent.close()
  }
}
