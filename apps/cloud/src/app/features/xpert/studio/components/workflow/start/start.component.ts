import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { XpertStudioContextMenuComponent } from '../../context-menu/context-menu.component'
import { MatTooltipModule } from '@angular/material/tooltip'
import { PlusSvgComponent } from '@metad/ocap-angular/common'

@Component({
  selector: 'xp-xpert-workflow-node-start',
  templateUrl: './start.component.html',
  styleUrls: ['./start.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, FFlowModule, CdkMenuModule, TranslateModule, MatTooltipModule, PlusSvgComponent]
})
export class XpertWorkflowNodeStartComponent extends WorkflowBaseNodeComponent {
  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)

  // Models
  readonly draft = this.studioService.viewModel

  // Inputs
  readonly menu = input<XpertStudioContextMenuComponent>()
}
