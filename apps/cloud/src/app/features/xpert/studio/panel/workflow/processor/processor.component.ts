import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNProcessor, IWorkflowNode, KnowledgebaseService } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { FormsModule } from '@angular/forms'
import { SafePipe } from '@metad/core'

@Component({
  selector: 'xpert-workflow-processor',
  templateUrl: './processor.component.html',
  styleUrls: ['./processor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, SafePipe, NgmI18nPipe, JSONSchemaFormComponent]
})
export class XpertWorkflowProcessorComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly processor = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNProcessor,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly provider = attrModel(this.processor, 'provider')
  readonly documentTransformerStrategies = toSignal(this.knowledgebaseAPI.documentTransformerStrategies$)
  readonly transformerStrategy = computed(() =>
    this.documentTransformerStrategies()?.find((item) => item.name === this.provider())
  )
  readonly transformerConfigSchema = computed(() => this.transformerStrategy()?.configSchema || null)
  readonly transformer = attrModel(this.processor, 'config')
}
