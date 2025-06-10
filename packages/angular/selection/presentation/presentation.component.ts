import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { attrModel } from '@metad/ocap-angular/core'
import { PresentationVariant } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule, MatTooltipModule],
  selector: 'ngm-presentation',
  templateUrl: 'presentation.component.html',
  styleUrls: ['presentation.component.scss']
})
export class NgmPresentationComponent {

  readonly presentation = model<PresentationVariant>()

  readonly topN = attrModel(this.presentation, 'maxItems')

  readonly topNOptions = [5, 10, 20, 50, 100]
  
}
