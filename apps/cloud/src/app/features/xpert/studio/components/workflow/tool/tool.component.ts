import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  getToolLabel,
  IWFNTool,
} from 'apps/cloud/src/app/@core'
import { of } from 'rxjs'
import { XpertNodeErrorHandlingComponent } from '../../error-handling/error.component'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-node-tool',
  templateUrl: './tool.component.html',
  styleUrls: ['./tool.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    MatTooltipModule,
    TranslateModule,
    PlusSvgComponent,
    NgmI18nPipe,
    EmojiAvatarComponent,
    XpertNodeErrorHandlingComponent
  ]
})
export class XpertWorkflowNodeToolComponent extends WorkflowBaseNodeComponent {

  // States
  readonly toolEntity = computed(() => this.entity() as IWFNTool)
  readonly errorHandling = computed(() => this.toolEntity()?.errorHandling)
  readonly toolsetId = computed(() => this.toolEntity()?.toolsetId)

  readonly #toolset = myRxResource({
    request: () => this.toolsetId(),
    loader: ({ request }) => {
      if (request) {
        return this.studioService.getToolset(request).toolset$
      }
      return of(null)
    }
  })

  readonly toolset = this.#toolset.value
  readonly loading = computed(() => this.#toolset.status() === 'loading')

  readonly tool = computed(() => {
    const tool = this.toolset()?.tools.find((_) => _.name === this.toolEntity()?.toolName)
    if (tool) {
      return {
        ...tool,
        label: getToolLabel(tool),
      }
    }
    return null
  })
}
