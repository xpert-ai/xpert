import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNJSONParse } from 'apps/cloud/src/app/@core'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'

@Component({
  selector: 'xp-workflow-panel-json-parse',
  templateUrl: './json-parse.component.html',
  styleUrls: ['./json-parse.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, StateVariableSelectComponent]
})
export class XpertWorkflowPanelJSONParseComponent extends XpertWorkflowBaseComponent {
  // States
  readonly jsonParseEntity = linkedModel<IWFNJSONParse>({
    initialValue: null,
    compute: () => this.node()?.entity as IWFNJSONParse,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly inputVariable = attrModel(this.jsonParseEntity, 'inputVariable')

  readonly inputExpand = signal(true)
  readonly outputExpand = signal(true)

  toggleInputExpand() {
    this.inputExpand.update((state) => !state)
  }

  toggleOutputExpand() {
    this.outputExpand.update((state) => !state)
  }
}
