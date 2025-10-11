import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, output, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { parseYAML } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import {
  DeepPartial,
  getErrorMessage,
  IKnowledgebase,
  injectToastr,
  IXpert,
  KnowledgebaseService,
  KnowledgebaseTypeEnum,
  routeAnimations,
  TTemplate,
  TXpertTeamDraft,
  uuid,
  XpertAPIService,
  XpertTemplateService,
  XpertTypeEnum
} from '../../../@core'
import { IconComponent } from '../../avatar'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  selector: 'xp-pipelines',
  templateUrl: './pipelines.component.html',
  styleUrls: ['./pipelines.component.scss'],
  imports: [CommonModule, RouterModule, TranslateModule, NgmSpinComponent, IconComponent],
  animations: [routeAnimations]
})
export class XpertPipelinesComponent {
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly xpertTemplateAPI = inject(XpertTemplateService)
  readonly xpertAPI = inject(XpertAPIService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly toastr = injectToastr()

  // Inputs
  readonly workspaceId = input<string>()
  readonly knowledgebase = input<IKnowledgebase>()

  // Outputs
  readonly created = output<IXpert>()

  // States
  readonly #tempaltes = myRxResource({
    request: () => ({}),
    loader: ({ request }) => {
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
        this.created.emit(pipeline)
      },
      error: (err) => {
        this.loading.set(false)
        this.toastr.error(getErrorMessage(err))
      }
    })
  }

  installTemplate(template: TTemplate) {
    this.loading.set(true)
    const xpert: DeepPartial<IXpert> = {
      workspaceId: this.workspaceId(),
      type: XpertTypeEnum.Knowledge,
      latest: true,
      agent: {
				key: uuid(),
				options: {
					hidden: true
				}
			},
    }

    this.xpertTemplateAPI
      .getKnowledgePipelineTemplate(template.id)
      .pipe(
        switchMap((data) => parseYAML<TXpertTeamDraft>(data.export_data)),
        switchMap((draft) => {
          return this.knowledgebase()
            ? of({ draft, knowledgebase: this.knowledgebase() })
            : this.knowledgebaseAPI
                .create({
                  workspaceId: this.workspaceId(),
                  type: KnowledgebaseTypeEnum.Standard,
                  name: template.name + ` - ${uuid()}`,
                  description: template.description
                })
                .pipe(map((knowledgebase) => ({ draft, knowledgebase })))
        }),
        switchMap(({ draft, knowledgebase }) => {
          return this.xpertAPI.importDSL({
            ...draft,
            team: {
              ...draft.team,
              ...xpert,
              name: `${knowledgebase.name} Pipeline - ${uuid()}`,
              knowledgebase: knowledgebase ? { id: knowledgebase.id } : undefined
            }
          })
        })
      )
      .subscribe({
        next: (pipeline) => {
          this.created.emit(pipeline)
          this.loading.set(false)
        },
        error: (err) => {
          this.loading.set(false)
          this.toastr.error(getErrorMessage(err))
        }
      })
  }
}
