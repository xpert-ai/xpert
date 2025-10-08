import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { XpertPipelinesComponent } from '@cloud/app/@shared/knowledge'
import { TranslateModule } from '@ngx-translate/core'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { injectToastr, IXpert, KnowledgebaseService, routeAnimations } from '../../../../@core'

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-pipelines',
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
  imports: [CommonModule, TranslateModule, XpertPipelinesComponent],
  animations: [routeAnimations]
})
export class KnowledgePipelinesComponent {
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly toastr = injectToastr()
  readonly workspaceId = injectQueryParams('workspaceId')

  onPipelineCreated(pipeline: IXpert) {
    this.router.navigate(['../', pipeline.knowledgebase.id], { relativeTo: this.route })
  }

  goBack() {
    history.back()
  }
}
