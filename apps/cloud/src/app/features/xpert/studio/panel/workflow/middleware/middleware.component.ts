import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectXpertAgentAPI, IWFNMiddleware } from 'apps/cloud/src/app/@core'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { IconComponent } from '@cloud/app/@shared/avatar'

@Component({
  selector: 'xpert-workflow-middleware',
  templateUrl: './middleware.component.html',
  styleUrls: ['./middleware.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe, IconComponent, JSONSchemaFormComponent]
})
export class XpertWorkflowMiddlewareComponent extends XpertWorkflowBaseComponent {

  readonly agentAPI = injectXpertAgentAPI()

  // Models
  readonly entity = linkedModel({
    initialValue: null,
    compute: () => this.node()?.entity as IWFNMiddleware,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), () => value)
    }
  })

  readonly middlewares = attrModel(this.entity, 'middlewares', [])
  readonly provider = attrModel(this.entity, 'provider')
  readonly options = attrModel(this.entity, 'options')
  readonly middlewaresCount = computed(() => this.middlewares()?.length ?? 0)

  readonly agentMiddlewares = toSignal(this.agentAPI.agentMiddlewares$)

  readonly providerMeta = computed(() => this.agentMiddlewares()?.find((m) => m.meta.name === this.provider())?.meta)
  readonly configSchema = computed(() => this.providerMeta()?.configSchema)
}
