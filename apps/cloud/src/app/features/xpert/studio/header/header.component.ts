import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { NgmTooltipDirective, nonBlank } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ChatConversationService,
  getErrorMessage,
  IChatConversation,
  OrderTypeEnum,
  ToastrService,
  XpertService
} from 'apps/cloud/src/app/@core'
import { MaterialModule } from 'apps/cloud/src/app/@shared'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { formatRelative } from 'date-fns'
import { sortBy } from 'lodash-es'
import { distinctUntilChanged, filter, map, shareReplay, switchMap } from 'rxjs'
import { getDateLocale } from '../../../../@core'
import { XpertStudioApiService } from '../domain'
import { XpertExecutionService } from '../services/execution.service'
import { XpertStudioComponent } from '../studio.component'

@Component({
  selector: 'xpert-studio-header',
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    MaterialModule,
    TranslateModule,
    NgmTooltipDirective,
    InDevelopmentComponent
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
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)

  readonly preview = model(false)

  readonly team = computed(() => this.xpertStudioComponent.team())
  readonly version = computed(() => this.team()?.version)
  readonly latest = computed(() => this.team()?.latest)
  readonly versions = computed(() => {
    const versions = this.apiService.versions()?.filter(nonBlank)
    return sortBy(versions, 'version').reverse()
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

  readonly publishing = signal(false)

  // Executions
  readonly xpertId$ = toObservable(this.team).pipe(
    map((xpert) => xpert?.id),
    distinctUntilChanged(),
    filter(nonBlank)
  )
  readonly conversations$ = this.xpertId$.pipe(
    switchMap((id) => this.chatConversationService.findAllByXpert(id, { order: { updatedAt: OrderTypeEnum.DESC } })),
    map(({ items }) => items),
    shareReplay(1)
  )

  readonly conversationId = this.executionService.conversationId

  publish() {
    this.publishing.set(true)
    this.xpertService.publish(this.xpertStudioComponent.id()).subscribe({
      next: (result) => {
        this.#toastr.success(
          `PAC.Xpert.PublishedSuccessfully`,
          { Default: 'Published successfully' },
          `v${result.version}`
        )
        this.publishing.set(false)
        this.apiService.refresh()
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.publishing.set(false)
      }
    })
  }

  resume() {
    this.apiService.resume()
  }

  selectVersion(id: string) {
    this.router.navigate(['../../', id, 'agents'], { relativeTo: this.route })
  }

  togglePreview() {
    this.preview.update((state) => !state)
  }

  openConversation(item: IChatConversation) {
    this.preview.set(true)
    this.executionService.setConversation(item)
  }

  export(isDraft = false) {
    this.xpertService.exportDSL(this.team().id, isDraft).subscribe({
      next: (result) => {
        const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xpert-${this.apiService.team().slug}.yaml`
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.#toastr.error(
          `PAC.Xpert.ExportFailed`,
          getErrorMessage(err)
        )
      }
    })

    // const draft = isDraft ? this.apiService.store.getValue().draft : this.apiService.getInitialDraft()
    // const result = stringify(instanceToPlain(new XpertDraftDslDTO(draft)))
    
  }
}
