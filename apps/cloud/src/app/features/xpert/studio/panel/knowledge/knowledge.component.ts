import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgebase, TXpertTeamNode, KnowledgebaseService, AiModelTypeEnum, getErrorMessage, TKBRecallParams } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertKnowledgeTestComponent } from './test/test.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, map, of, startWith } from 'rxjs'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { omit } from 'lodash-es'
import { Router } from '@angular/router'
import { MatSliderModule } from '@angular/material/slider'
import { KnowledgeRecallParamsComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { XpertStudioApiService } from '../../domain'

@Component({
  selector: 'xpert-studio-panel-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    MatSliderModule,
    CloseSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertKnowledgeTestComponent,
    KnowledgeRecallParamsComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelKnowledgeComponent {
  eModelType = AiModelTypeEnum
  readonly elementRef = inject(ElementRef)
  readonly #router = inject(Router)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  
  // States
  readonly id = computed(() => this.node()?.key)
  readonly name = computed(() => (<IKnowledgebase>this.node()?.entity)?.name)
  readonly #knowledgebase = derivedAsync<{loading?: boolean; error?: string; knowledgebase?: IKnowledgebase;}>(() =>
    this.id() ? this.knowledgebaseService.getOneById(this.id(), { relations: ['copilotModel'] }).pipe(
      map((knowledgebase) => ({knowledgebase})),
      catchError((err) => of({error: getErrorMessage(err), knowledgebase: omit(this.node()?.entity, 'id') as IKnowledgebase})),
      startWith({loading: true})
    ) : of({knowledgebase: this.node()?.entity as IKnowledgebase}), {initialValue: null}
  )
  readonly knowledgebase = computed(() => this.#knowledgebase()?.knowledgebase)
  readonly loading = computed(() => this.#knowledgebase()?.loading)

  readonly copilotModel = computed(() => this.knowledgebase()?.copilotModel)

  readonly openedTest = signal(false)

  readonly knowledgebases = toSignal(this.studioService.knowledgebases$)

  readonly xpert = computed(() => this.studioService.xpert())

  readonly recalls = computed(() => this.xpert()?.agentConfig?.recalls)
  readonly recall = computed(() => this.recalls()?.[this.id()])

  openTest() {
    this.openedTest.set(true)
  }

  closeTest() {
    this.openedTest.set(false)
  }

  closePanel() {
    this.panelComponent.close()
  }

  gotoKnowledgebase() {
    this.#router.navigate(['/xpert/w/', this.xpert().workspaceId ,'knowledges'])
  }

  useKnowledgebase(k: IKnowledgebase) {
    this.studioService.replaceKnowledgebase(this.id(), k)
  }

  updateRecall(value: TKBRecallParams) {
    this.studioService.updateXpertAgentConfig({recalls: {...(this.recalls() ?? {}), [this.id()]: value}})
  }

  edit() {
    window.open(['/xpert', 'knowledges', this.knowledgebase().id].join('/'), '_blank')
  }
}
