import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { injectExportXpertDsl, XpertInlineProfileComponent } from '@cloud/app/@shared/xpert'
import { OverlayAnimation1 } from '@metad/core'
import { injectConfirmDelete, NgmCopyComponent, NgmSlideToggleComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { AppService } from '@cloud/app/app.service'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { injectParams } from 'ngxtension/inject-params'
import { catchError, EMPTY } from 'rxjs'
import {
  getErrorMessage,
  injectApiBaseUrl,
  injectHelpWebsite,
  IXpert,
  KnowledgebaseService,
  KnowledgebaseTypeEnum,
  routeAnimations,
  ToastrService
} from '../../../../@core'
import { XpertDevelopApiKeyComponent } from '../../xpert/develop'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase',
  templateUrl: './knowledgebase.component.html',
  styleUrls: ['./knowledgebase.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TranslateModule,
    CdkMenuModule,
    NgmSlideToggleComponent,
    NgmCopyComponent,
    EmojiAvatarComponent,
    NgmSpinComponent,
    XpertInlineProfileComponent
  ],
  animations: [routeAnimations, OverlayAnimation1]
})
export class KnowledgebaseComponent {
  eKnowledgebaseTypeEnum = KnowledgebaseTypeEnum

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly paramId = injectParams('id')
  readonly appService = inject(AppService)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly i18nService = injectI18nService()
  readonly exportXpertDsl = injectExportXpertDsl()
  readonly confirmDelete = injectConfirmDelete()
  readonly apiBaseUrl = injectApiBaseUrl()
  readonly apiHelpUrl = injectHelpWebsite('/docs/ai/knowledge/api/')

  readonly #knowledgebase = myRxResource({
    request: () => ({
      id: this.paramId()
    }),
    loader: ({ request }) => {
      return this.knowledgebaseAPI
        .getOneById(request.id, {
          relations: ['copilotModel', 'rerankModel', 'visionModel', 'xperts', 'pipeline'],
          select: {
            xperts: {
              id: true,
              slug: true,
              name: true,
              description: true
            },
            pipeline: {
              id: true,
              publishAt: true,
              version: true
            }
          } as any
        })
        .pipe(
          catchError((err) => {
            this._toastrService.danger(err)
            this.#router.navigate(['/xpert/w'])
            return EMPTY
          })
        )
    }
  })
  readonly knowledgebase = this.#knowledgebase.value

  readonly type = computed(() => this.knowledgebase()?.type)
  readonly avatar = computed(() => this.knowledgebase()?.avatar)
  readonly external = computed(() => this.knowledgebase()?.type === KnowledgebaseTypeEnum.External)
  readonly pipelineId = computed(() => this.knowledgebase()?.pipelineId)
  readonly pipeline = computed(() => this.knowledgebase()?.pipeline)
  readonly documentNum = linkedModel({
    initialValue: 0,
    compute: () => this.knowledgebase()?.documentNum || 0,
    update: (value) => {
      //
    }
  })
  readonly xpertCount = computed(() => this.knowledgebase()?.xperts.length || 0)
  readonly xperts = computed(() => this.knowledgebase()?.xperts || [])

  // Sidebar
  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())

  readonly #loading = signal(false)
  readonly loading = computed(() => this.#loading() || this.#knowledgebase.status() === 'loading')

  readonly apiUrl = computed(() => this.apiBaseUrl + '/api/ai/')

  readonly apiEnabled = linkedModel({
    initialValue: null,
    compute: () => this.knowledgebase()?.apiEnabled,
    update: (value) => {
      this.#loading.set(true)
      this.knowledgebaseAPI
        .update(this.knowledgebase().id, {
          apiEnabled: value
        })
        .subscribe({
          next: () => {
            this.#loading.set(false)
            this._toastrService.success('PAC.Knowledgebase.ApiStatusChanged', { Default: 'API status changed' })
          },
          error: (err) => {
            this.#loading.set(false)
            this._toastrService.danger(err)
          }
        })
    }
  })

  refresh() {
    this.#knowledgebase.reload()
  }

  toggleSideMenu() {
    this.sideMenuOpened.update((state) => !state)
  }

  deleteKnowledgebase() {
    const knowledgebase = this.knowledgebase()
    this.confirmDelete({
        value: knowledgebase.name,
        information: knowledgebase.xperts.length ? 
          this.i18nService.instant('PAC.Knowledgebase.DeleteWithExpertsWarning', { Default: `This knowledge base has been referenced by digital experts. Deleting it will cause access exception.` })
          : knowledgebase.description
      }, () => {
        this.#loading.set(true)
        return this.knowledgebaseAPI.delete(knowledgebase.id)
      })
      .subscribe({
        next: () => {
          this.#loading.set(false)
          this.#router.navigate(['/xpert/w'])
        },
        error: (err) => {
          this.#loading.set(false)
          this._toastrService.danger(err)
        }
      })
  }

  downloadPipeline(id: string) {
    this.#loading.set(true)
    this.exportXpertDsl(id, {
      isDraft: false,
      includeMemory: false,
      slug: this.knowledgebase().name,
    }).subscribe({
      next: () => {
        this.#loading.set(false)
      },
      error: (err) => {
        this.#loading.set(false)
        this._toastrService.error(`PAC.Xpert.ExportFailed`, getErrorMessage(err))
      }
    })
  }

  openXpert(xpert: IXpert) {
    window.open(['/xpert/x', xpert.id, 'agents'].join('/'), '_blank')
  }

  openApiReference() {
    window.open(this.apiHelpUrl(), '_blank')
  }

  openApiKey() {
    this.#dialog
      .open(XpertDevelopApiKeyComponent, {
        data: {
          id: this.knowledgebase().id,
          type: 'knowledgebase'
        }
      })
      .closed.subscribe({
        next: () => {}
      })
  }
}
