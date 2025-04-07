import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { DynamicGridDirective, routeAnimations } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { EnvironmentService } from 'apps/cloud/src/app/@core'
import { CardCreateComponent } from 'apps/cloud/src/app/@shared/card'
import { derivedAsync } from 'ngxtension/derived-async'
import { XpertWorkspaceHomeComponent } from '../home/home.component'
import { map } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    DragDropModule,
    CdkMenuModule,
    OverlayModule,
    TranslateModule,
    MatTooltipModule,
    DynamicGridDirective,

    CardCreateComponent
  ],
  selector: 'xpert-workspace-environments',
  templateUrl: './environments.component.html',
  styleUrl: 'environments.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertWorkspaceEnvironmentsComponent {
  readonly environmentService = inject(EnvironmentService)
  readonly homeComponent = inject(XpertWorkspaceHomeComponent)

  readonly workspace = this.homeComponent.workspace
  readonly environments = derivedAsync(() => {
    return this.environmentService.getAllInOrg({
      where: {
        workspaceId: this.workspace()?.id
      }
    }).pipe(map(({items}) => items))
  })

  createEnvironment() {
    
  }
}
