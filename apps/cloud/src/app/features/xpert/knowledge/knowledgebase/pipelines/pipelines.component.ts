import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { getErrorMessage, injectToastr, KnowledgebaseService, routeAnimations, XpertTemplateService } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { myRxResource } from '@metad/ocap-angular/core'

@Component({
  standalone: true,
  selector: 'xp-knowledgebase-pipelines',
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
  imports: [CommonModule, RouterModule, NgmSpinComponent],
  animations: [routeAnimations]
})
export class KnowledgePipelinesComponent {
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly xpertTemplateAPI = inject(XpertTemplateService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly toastr = injectToastr()

  // States
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly #tempaltes = myRxResource({
    request: () => ({}),
    loader: ({request}) => {
      return this.xpertTemplateAPI.getAllKnowledgePipelines({})
    }
  })
  readonly templates = computed(() => this.#tempaltes.value()?.templates ?? [])

  readonly loading = signal(false)

  createPipeline() {
    this.loading.set(true)
    this.knowledgebaseAPI.createPipeline(this.knowledgebase().id).subscribe({
      next: (pipeline) => {
        this.router.navigate(['./', pipeline.id], { relativeTo: this.route })
        this.loading.set(false)
        this.knowledgebaseComponent.refresh()
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
  }
}
