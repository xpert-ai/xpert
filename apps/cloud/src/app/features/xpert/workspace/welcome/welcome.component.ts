import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { IXpertWorkspace } from '@metad/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { injectUser } from 'apps/cloud/src/app/@core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, RouterModule, MatTooltipModule],
  selector: 'xpert-workspace-welcome',
  templateUrl: './welcome.component.html',
  styleUrl: 'welcome.component.scss',
  animations: [],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceWelcomeComponent {
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  readonly #router = inject(Router)
  readonly me = injectUser()

  readonly workspaces = computed(() => {
    return this.homeComponent.workspaces()?.slice(0, 10)
  })

  newWorkspace() {
    this.homeComponent.newWorkspace()
  }

  navigate(workspace: IXpertWorkspace) {
    this.homeComponent.selectWorkspace(workspace)
  }
}
