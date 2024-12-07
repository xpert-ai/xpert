import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgebase, TXpertTeamNode, KnowledgebaseService, AiModelTypeEnum } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertKnowledgeTestComponent } from './test/test.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'

@Component({
  selector: 'xpert-studio-panel-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslateModule,
    MatTooltipModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertKnowledgeTestComponent,
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelKnowledgeComponent {
  eModelType = AiModelTypeEnum
  readonly elementRef = inject(ElementRef)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly knowledgebaseService = inject(KnowledgebaseService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  
  // States
  readonly id = computed(() => this.node()?.key)
  readonly knowledgebase = derivedAsync(() =>
    this.id() ? this.knowledgebaseService.getOneById(this.id(), { relations: ['copilotModel'] }) : of(this.node()?.entity as IKnowledgebase)
  )

  readonly copilotModel = computed(() => this.knowledgebase()?.copilotModel)


  readonly openedTest = signal(false)

  openTest() {
    this.openedTest.set(true)
  }
  closeTest() {
    this.openedTest.set(false)
  }

  closePanel() {
    this.panelComponent.close()
  }
}
