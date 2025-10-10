import { CdkMenuModule } from '@angular/cdk/menu'
import { Component, computed, inject, model, signal } from '@angular/core'
import { RouterModule } from '@angular/router'
import { XpertInlineProfileComponent } from '@cloud/app/@shared/xpert'
import { AppService } from '@cloud/app/app.service'
import { NgmCopyComponent, NgmSlideToggleComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { injectParams } from 'ngxtension/inject-params'
import { Dialog } from '@angular/cdk/dialog'
import { OverlayAnimation1 } from '@metad/core'
import { IXpert, KnowledgebaseService, KnowledgebaseTypeEnum, ToastrService, injectApiBaseUrl, routeAnimations } from '../../../../@core'
import { XpertDevelopApiKeyComponent } from '../../xpert/develop'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'

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
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly #knowledgebase = myRxResource({
    request: () => ({
      id: this.paramId()
    }),
    loader: ({ request }) => {
      return this.knowledgebaseAPI.getOneById(request.id, {
        relations: ['copilotModel', 'rerankModel', 'visionModel', 'xperts', 'documents'],
        select: {
          xperts: {
            id: true,
            slug: true,
            name: true,
            description: true
          },
          documents: {
            id: true
          }
        } as any
      })
    }
  })
  readonly knowledgebase = this.#knowledgebase.value

  readonly type = computed(() => this.knowledgebase()?.type)
  readonly avatar = computed(() => this.knowledgebase()?.avatar)
  readonly pipelineId = computed(() => this.knowledgebase()?.pipelineId)
  readonly documentNum = computed(() => this.knowledgebase()?.documentNum || 0)
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
      this.knowledgebaseAPI.update(this.knowledgebase().id, {
        apiEnabled: value
      }).subscribe({
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
    this.#loading.set(true)
    this.knowledgebaseAPI.delete(this.knowledgebase().id).subscribe({
      next: () => {},
      error: (err) => {
        this._toastrService.danger(err)
      }
    })
  }

  downloadPipeline() {}

  openXpert(xpert: IXpert) {
    window.open(['/xpert/x', xpert.id, 'agents'].join('/'), '_blank')
  }

  openApiReference() {
    window.open(this.apiBaseUrl + '/swg', '_blank')
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
