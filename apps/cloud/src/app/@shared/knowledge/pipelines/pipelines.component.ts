import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, model, output, signal } from '@angular/core'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { parseYAML } from '@metad/core'
import { injectConfirmUnique, NgmSpinComponent } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { switchMap } from 'rxjs/operators'
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
import { injectI18nService } from '../../i18n'


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
  readonly #i18n = injectI18nService()
  readonly inputName = injectConfirmUnique()

  // Inputs
  readonly workspaceId = input<string>()
  readonly knowledgebase = model<IKnowledgebase>()

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

  async createPipeline() {
    if (!this.knowledgebase()) {
      await this.createEmptyKB()
      if (!this.knowledgebase()) return
    }

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

  async createEmptyKB() {
    const name = await firstValueFrom(this.inputName<string>({
        title: this.#i18n.instant('PAC.Knowledgebase.CreateEmptyKnowledgebase', { Default: 'Create an empty knowledgebase' }),
        description: this.#i18n.instant('PAC.Knowledgebase.CreateEmptyKnowledgebaseDesc', { Default: 'There are no documents in an empty knowledge base yet. You can upload documents to this knowledge base at any time in the future.' }),
        value: ''
      }))
    if (!name) {
      return
    }

    this.loading.set(true)
    try {
      const result = await firstValueFrom(
        this.knowledgebaseAPI
              .create({
                workspaceId: this.workspaceId(),
                type: KnowledgebaseTypeEnum.Standard,
                name: name,
                // description: template.description
              })
      )
      this.loading.set(false)
      this.knowledgebase.set(result)
    } catch (error) {
      this.loading.set(false)
      this.toastr.error(getErrorMessage(error))
      return
    }
  }

  async installPipeline(draft: TXpertTeamDraft) {
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

    if (!this.knowledgebase()) {
      await this.createEmptyKB()
    }

    const knowledgebase = this.knowledgebase()
    if (!knowledgebase) return

    this.loading.set(true)
    this.xpertAPI.importDSL({
      ...draft,
      team: {
        ...draft.team,
        ...xpert,
        name: `${knowledgebase.name} Pipeline - ${uuid()}`,
        knowledgebase: knowledgebase ? { id: knowledgebase.id } : undefined
      }
    }).subscribe({
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

  installTemplate(template: TTemplate) {
    this.loading.set(true)
    this.xpertTemplateAPI
      .getKnowledgePipelineTemplate(template.id)
      .pipe(
        switchMap((data) => parseYAML<TXpertTeamDraft>(data.export_data)),
      )
      .subscribe({
        next: (draft) => {
          this.loading.set(false)
          this.installPipeline(draft)
        },
        error: (err) => {
          this.loading.set(false)
          this.toastr.error(getErrorMessage(err))
        }
      })
  }


  /**
   * handle file from browsing
   */
  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.importFromDSLFile(event.files)
  }

  importFromDSLFile(files: FileList) {
    const file = files?.item(0)
    if (!file) {
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const content = reader.result as string
      this.installPipeline(await parseYAML<TXpertTeamDraft>(content))
    }
    reader.readAsText(file)
  }
}
