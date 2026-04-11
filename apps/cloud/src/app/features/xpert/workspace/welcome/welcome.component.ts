
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { Router, RouterModule } from '@angular/router'
import { IXpertWorkspace } from '@xpert-ai/contracts'
import { TranslateModule } from '@ngx-translate/core'
import { injectUser } from 'apps/cloud/src/app/@core'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TranslateModule, RouterModule, ...ZardTooltipImports],
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
