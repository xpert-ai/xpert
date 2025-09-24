import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { getErrorMessage, injectToastr, KnowledgebaseService, routeAnimations } from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase-pipelines',
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
  imports: [CommonModule, RouterModule, NgmSpinComponent],
  animations: [routeAnimations]
})
export class KnowledgePipelinesComponent {
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly toastr = injectToastr()

  // States
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

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
