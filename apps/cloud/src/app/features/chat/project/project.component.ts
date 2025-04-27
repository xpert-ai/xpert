import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { attrModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { ProjectService } from './project.service'
import { routeAnimations } from '@cloud/app/@core'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, CdkMenuModule, TranslateModule],
  selector: 'pac-chat-project',
  templateUrl: './project.component.html',
  styleUrl: 'project.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [routeAnimations],
  providers: [ProjectService]
})
export class ChatProjectComponent {
  readonly projectService = inject(ProjectService)

  readonly id = this.projectService.id
  readonly project = this.projectService.project

  readonly avatar = attrModel(this.project, 'avatar')
  readonly name = attrModel(this.project, 'name')
}
