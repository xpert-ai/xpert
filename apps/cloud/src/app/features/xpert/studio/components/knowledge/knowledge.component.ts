import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { TXpertTeamNode } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'

@Component({
  selector: 'xpert-studio-node-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, EmojiAvatarComponent, NgmSpinComponent],
  host: {
    tabindex: '-1',
    '[class]': 'className()'
  }
})
export class XpertStudioNodeKnowledgeComponent {
  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)

  readonly node = input<TXpertTeamNode & { type: 'knowledge' }>()
  readonly id = computed(() => this.node()?.key)
  readonly knowledge = computed(() => this.node().entity)

  readonly knowledgebases = toSignal(this.studioService.knowledgebases$, { initialValue: null })
  readonly knowledgebaseDetail = computed(() => this.knowledgebases()?.find((_) => _.id === this.id()))
  readonly status = computed(() =>
    this.id() && this.knowledgebases() && !this.knowledgebaseDetail() ? 'template' : null
  )

  readonly executions = computed(() => this.executionService.knowledgeMessages()?.filter((_) => _.data?.toolset_id?.split(',').includes(this.id())))
  readonly executionStatus = computed(() => {
    const executions = this.executions()
    if (!executions || executions.length === 0) {
      return null
    }
    if (executions.some((_) => _.data.status === 'running')) {
      return 'running'
    } else if (executions.some((_) => _.data.status === 'fail')) {
      return 'error'
    } else {
      return 'success'
    }
  })

  readonly className = computed(() => `${this.executionStatus() ?? ''} ${this.status() ?? ''}`)
}
