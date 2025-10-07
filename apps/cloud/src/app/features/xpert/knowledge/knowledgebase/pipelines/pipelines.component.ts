import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { XpertPipelinesComponent } from '@cloud/app/@shared/knowledge'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { injectToastr, IXpert, KnowledgebaseService, routeAnimations } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-pipelines',
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
  imports: [CommonModule, RouterModule, XpertPipelinesComponent],
  animations: [routeAnimations]
})
export class KnowledgebasePipelinesComponent {
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly toastr = injectToastr()
  readonly workspaceId = injectQueryParams('workspaceId')

  // States
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  onPipelineCreated(pipeline: IXpert) {
    this.router.navigate(['./', pipeline.id], { relativeTo: this.route })
  }
}
