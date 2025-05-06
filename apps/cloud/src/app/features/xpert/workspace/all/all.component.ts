import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { routeAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertWorkspaceApiToolsComponent } from '../api-tools/tools.component'
import { XpertWorkspaceBuiltinToolsComponent } from '../builtin-tools/tools.component'
import { XpertWorkspaceXpertsComponent } from '../xperts/xperts.component'
import { XpertWorkspaceKnowledgesComponent } from '../knowledges/knowledges.component'
import { XpertWorkspaceMCPToolsComponent } from '../mcp-tools/tools.component'
import { XpertWorkspaceHomeComponent } from '../home/home.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    XpertWorkspaceXpertsComponent,
    XpertWorkspaceKnowledgesComponent,
    XpertWorkspaceApiToolsComponent,
    XpertWorkspaceBuiltinToolsComponent,
    XpertWorkspaceMCPToolsComponent,
  ],
  selector: 'xpert-workspace-all',
  templateUrl: './all.component.html',
  styleUrl: 'all.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceAllComponent {
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)
  
  readonly workspace = this.homeComponent.workspace
  readonly workspaceId = computed(() => this.workspace()?.id)
}
