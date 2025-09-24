import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNChunker, IWFNProcessor, IWorkflowNode, KnowledgebaseService } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { FormsModule } from '@angular/forms'
import { SafePipe } from '@metad/core'

@Component({
  selector: 'xpert-workflow-chunker',
  templateUrl: './chunker.component.html',
  styleUrls: ['./chunker.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, SafePipe, NgmI18nPipe, JSONSchemaFormComponent]
})
export class XpertWorkflowChunkerComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly chunker = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNChunker,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly provider = attrModel(this.chunker, 'provider')
  readonly chunkerStrategies = toSignal(this.knowledgebaseAPI.textSplitterStrategies$)
  readonly chunkerStrategy = computed(() =>
    this.chunkerStrategies()?.find((item) => item.name === this.provider())
  )
  readonly chunkerConfigSchema = computed(() => this.chunkerStrategy()?.configSchema || null)
  readonly chunkerConfig = attrModel(this.chunker, 'config')
}
