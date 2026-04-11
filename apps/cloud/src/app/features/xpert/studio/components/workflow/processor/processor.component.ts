import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNProcessor } from 'apps/cloud/src/app/@core'
import { KnowledgebaseService } from '@cloud/app/@core'
import { toSignal } from '@angular/core/rxjs-interop'

import { IconComponent } from '@cloud/app/@shared/avatar'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-node-processor',
  templateUrl: './processor.component.html',
  styleUrls: ['./processor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    ...ZardTooltipImports,
    TranslateModule,
    PlusSvgComponent,
    NgmI18nPipe,
    IconComponent
],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeProcessorComponent extends WorkflowBaseNodeComponent {
  readonly knowledgebaseService = inject(KnowledgebaseService)

  // States
  readonly processorEntity = computed(() => this.entity() as IWFNProcessor)
  readonly provider = computed(() => this.processorEntity()?.provider)
  readonly config = computed(() => this.processorEntity()?.config)

  // Processor providers from knowledgebase service
  readonly processorProviders = toSignal(this.knowledgebaseService.documentTransformerStrategies$, { initialValue: [] })
  readonly processorProvider = computed(() => {
    const providerName = this.provider()
    if (providerName && this.processorProviders()) {
      return this.processorProviders().find((p) => p.meta.name === providerName)
    }
    return null
  })
}
