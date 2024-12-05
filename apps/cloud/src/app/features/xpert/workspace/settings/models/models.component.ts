import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertWorkspace, XpertWorkspaceService } from 'apps/cloud/src/app/@core'

@Component({
  selector: 'xpert-workspace-models',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './models.component.html',
  styleUrl: './models.component.scss'
})
export class XpertWorkspaceModelsComponent {
  readonly workspaceService = inject(XpertWorkspaceService)

  readonly workspace = input<IXpertWorkspace>()

  readonly workspaceId = computed(() => this.workspace()?.id)
}
