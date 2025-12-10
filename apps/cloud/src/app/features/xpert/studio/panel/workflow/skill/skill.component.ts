import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNSkill,
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-skill',
  templateUrl: './skill.component.html',
  styleUrls: ['./skill.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ClipboardModule, CdkMenuModule, TranslateModule]
})
export class XpertWorkflowSkillComponent extends XpertWorkflowBaseComponent {

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly #dialog = inject(Dialog)
  readonly #clipboard = inject(Clipboard)

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly entity = linkedModel({
    initialValue: null,
    compute: () => this.node()?.entity as IWFNSkill,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly skills = attrModel(this.entity, 'skills', [])

  // Models
  readonly draft = this.studioService.viewModel

}
