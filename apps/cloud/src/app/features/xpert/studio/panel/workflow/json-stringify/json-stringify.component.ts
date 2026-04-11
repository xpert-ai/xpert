import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNJSONStringify } from 'apps/cloud/src/app/@core'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xp-workflow-panel-json-stringify',
  templateUrl: './json-stringify.component.html',
  styleUrls: ['./json-stringify.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ...ZardTooltipImports, TranslateModule, StateVariableSelectComponent]
})
export class XpertWorkflowPanelJSONStringifyComponent extends XpertWorkflowBaseComponent {
  // States
  readonly jsonStringifyEntity = linkedModel<IWFNJSONStringify>({
    initialValue: null,
    compute: () => this.node()?.entity as IWFNJSONStringify,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })
  readonly inputVariable = attrModel(this.jsonStringifyEntity, 'inputVariable')

  readonly inputExpand = signal(true)
  readonly outputExpand = signal(true)

  toggleInputExpand() {
    this.inputExpand.update((state) => !state)
  }

  toggleOutputExpand() {
    this.outputExpand.update((state) => !state)
  }
}
