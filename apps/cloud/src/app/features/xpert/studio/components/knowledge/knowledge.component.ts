import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
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
  imports: [FFlowModule, MatTooltipModule, TranslateModule, EmojiAvatarComponent],
  host: {
    tabindex: '-1',
    '[class]': 'className()',
    '(contextmenu)': 'emitSelectionChangeEvent($event)'
  }
})
export class XpertStudioNodeKnowledgeComponent {
  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)

  readonly node = input<TXpertTeamNode>()
  readonly id = computed(() => this.node()?.key)
  readonly knowledge = computed(() => this.node().entity)

  readonly execution = computed(() => this.executionService.knowledgeExecutions()?.[this.id()])
  readonly executionStatus = computed(() => this.execution()?.status)

  readonly knowledgebases = toSignal(this.studioService.knowledgebases$, {initialValue: null})
  readonly knowledgebaseDetail = computed(() => this.knowledgebases()?.find((_) => _.id === this.id()))
  readonly status = computed(() => (this.id() && this.knowledgebases() && !this.knowledgebaseDetail() ? 'template' : null))

  readonly className = computed(() => `${this.executionStatus() ?? ''} ${this.status() ?? ''}`)

  private get hostElement(): HTMLElement {
    return this.elementRef.nativeElement
  }

  protected emitSelectionChangeEvent(event: MouseEvent): void {
    this.hostElement.focus()
    event.preventDefault()
    event.stopPropagation()

    // Open Context menu
  }
}
