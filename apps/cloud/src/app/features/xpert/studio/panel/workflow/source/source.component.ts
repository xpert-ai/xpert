import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNSource, IWorkflowNode, KnowledgebaseService } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  selector: 'xpert-workflow-source',
  templateUrl: './source.component.html',
  styleUrls: ['./source.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, NgmI18nPipe]
})
export class XpertWorkflowSourceComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly source = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNSource,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly provider = attrModel(this.source, 'provider')

  readonly documentSourceStrategies = toSignal(this.knowledgebaseAPI.documentSourceStrategies$)

  readonly documentSourceStrategy = computed(() => this.documentSourceStrategies()?.find((item) => item.name === this.provider()))
}
