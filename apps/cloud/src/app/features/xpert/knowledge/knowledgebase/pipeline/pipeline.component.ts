import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { routeAnimations } from '../../../../../@core'
import { XpertStudioComponent } from '../../../studio/studio.component'
import { XpertService } from '../../../xpert/xpert.service'
import { KnowledgebaseComponent } from '../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-pipeline',
  templateUrl: './pipeline.component.html',
  styleUrls: ['./pipeline.component.scss'],
  imports: [CommonModule, RouterModule, XpertStudioComponent],
  animations: [routeAnimations],
  providers: [XpertService]
})
export class KnowledgebasePipelineComponent {
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly xpertService = inject(XpertService)

  private publishedSub = this.xpertService.published$.subscribe({
    next: (pipeline) => {
      this.knowledgebaseComponent.refresh()
    }
  })
}
