import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, HostListener, inject, model, signal, ViewContainerRef } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router } from '@angular/router'
import { attrModel, OverlayAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { linkedModel, NgmI18nPipe, nonBlank } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  OrderTypeEnum,
  ToastrService,
  XpertService
} from 'apps/cloud/src/app/@core'
import { XpertPublishComponent } from 'apps/cloud/src/app/@shared/xpert'
import { formatRelative } from 'date-fns'
import {
  BehaviorSubject,
  catchError,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  tap
} from 'rxjs'
import { getDateLocale } from '../../../../@core'
import { XpertStudioApiService } from '../domain'
import { XpertExecutionService } from '../services/execution.service'
import { XpertStudioComponent } from '../studio.component'
import { XpertPublishVersionComponent } from './publish/publish.component'

@Component({
  selector: 'xpert-studio-header',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    MatSliderModule,
    TranslateModule,
    NgmSpinComponent,
    NgmI18nPipe
  ],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioHeaderComponent {
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly xpertService = inject(XpertService)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly chatConversationService = inject(ChatConversationService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly #viewContainerRef = inject(ViewContainerRef)

  // Inputs
  readonly sidePanel = model<'preview' | 'variables' | 'environments'>(null)
  readonly showFeatures = model(false)

  readonly team = computed(() => this.xpertStudioComponent.team())
  readonly xpert = this.xpertStudioComponent.xpert
  readonly version = computed(() => this.team()?.version)
  readonly latest = computed(() => this.team()?.latest)
  readonly versions = computed(() => {
    const versions = this.apiService.versions()?.filter(nonBlank)
    return versions.sort((a, b) => Number(b.version) - Number(a.version))
  })
  readonly draft = computed(() => this.apiService.draft())
  readonly unsaved = this.apiService.unsaved
  readonly draftSavedDate = computed(() => {
    if (this.draft()?.savedAt) {
      return new Date(this.draft().savedAt).toLocaleTimeString()
    }
    return null
  })
  readonly latestPublishDate = computed(() => {
    const publishDate = this.team()?.publishAt
    if (publishDate) {
      return formatRelative(new Date(publishDate), new Date(), {
        locale: getDateLocale(this.#translate.currentLang)
      })
    }
    return null
  })
  readonly checklist = computed(() => this.draft()?.checklist)
  readonly environment = this.apiService.environment

  readonly agentConfig = linkedModel({
    initialValue: null,
    compute: () => this.xpert()?.agentConfig,
    update: (config) => {
      this.apiService.updateXpertAgentConfig(config)
    }
  })
  readonly maxConcurrency = attrModel(this.agentConfig, 'maxConcurrency')
  readonly recursionLimit = attrModel(this.agentConfig, 'recursionLimit')

  // Executions
  readonly xpertId$ = toObservable(this.team).pipe(
    map((xpert) => xpert?.id),
    distinctUntilChanged(),
    filter(nonBlank)
  )
  readonly refreshConv$ = new BehaviorSubject<void>(null)
  readonly loadingConv = signal(false)
  readonly conversations$ = this.xpertId$.pipe(
    combineLatestWith(this.refreshConv$),
    tap(() => this.loadingConv.set(true)),
    switchMap(([id]) => this.chatConversationService.findAllByXpert(id, { order: { updatedAt: OrderTypeEnum.DESC } })),
    map(({ items }) => items),
    tap(() => this.loadingConv.set(false)),
    shareReplay(1)
  )

  readonly conversationId = this.executionService.conversationId

  // Diagram of agents
  readonly refreshDiagram$ = new BehaviorSubject<void>(null)
  readonly diagram$ = this.refreshDiagram$.pipe(
    switchMap(() =>
      this.xpertService.getDiagram(this.xpert().id).pipe(
        map((imageBlob) => (imageBlob ? { image: URL.createObjectURL(imageBlob), error: null } : null)),
        catchError((err) => of({ image: null, error: getErrorMessage(err) })),
        startWith(null)
      )
    ),
    shareReplay(1)
  )

  saveDraft() {
    this.apiService.saveDraft().subscribe()
  }

  publish() {
    this.#dialog.open(XpertPublishVersionComponent, {
      viewContainerRef: this.#viewContainerRef
    })
  }

  resume() {
    this.apiService.resume()
  }

  selectVersion(id: string) {
    this.router.navigate(['../../', id, 'agents'], { relativeTo: this.route })
  }

  togglePreview() {
    this.sidePanel.update((state) => (state === 'preview' ? null : 'preview'))
  }

  toggleVariables() {
    this.sidePanel.update((state) => (state === 'variables' ? null : 'variables'))
  }
  toggleEnvs() {
    this.sidePanel.update((state) => (state === 'environments' ? null : 'environments'))
  }

  toggleFeatures() {
    this.showFeatures.update((state) => !state)
  }

  openConversation(item: IChatConversation) {
    this.sidePanel.set('preview')
    this.executionService.setConversation(item)
  }

  export(isDraft = false) {
    this.xpertService.exportDSL(this.team().id, isDraft).subscribe({
      next: (result) => {
        const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `xpert-${this.apiService.team().slug}.yaml`
        a.click()
        window.URL.revokeObjectURL(url)
      },
      error: (err) => {
        this.#toastr.error(`PAC.Xpert.ExportFailed`, getErrorMessage(err))
      }
    })
  }

  publishToIntegration() {
    this.#dialog
      .open(XpertPublishComponent, {
        data: {
          xpert: this.xpert()
        }
      })
      .closed.subscribe({})
  }

  @HostListener('window:keydown', ['$event'])
  handleCtrlS(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault() // Prevent the default save dialog
      this.saveDraft()
    }
  }
}
