import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { NgmTooltipDirective, nonBlank } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ChatConversationService, getErrorMessage, IChatConversation, OrderTypeEnum, ToastrService, XpertService } from 'apps/cloud/src/app/@core'
import { MaterialModule } from 'apps/cloud/src/app/@shared'
import { formatRelative } from 'date-fns'
import { sortBy } from 'lodash-es'
import { getDateLocale } from '../../../../@core'
import { XpertStudioApiService } from '../domain'
import { XpertStudioComponent } from '../studio.component'
import { toObservable } from '@angular/core/rxjs-interop'
import { distinctUntilChanged, filter, map, shareReplay, switchMap } from 'rxjs'
import { XpertExecutionService } from '../services/execution.service'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { OverlayAnimations } from '@metad/core'

@Component({
  selector: 'xpert-studio-header',
  standalone: true,
  imports: [CommonModule, CdkMenuModule, MaterialModule, TranslateModule, NgxFloatUiModule, NgmTooltipDirective, InDevelopmentComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  animations: [...OverlayAnimations]
})
export class XpertStudioHeaderComponent {
  eNgxFloatUiPlacements = NgxFloatUiPlacements
  eNgxFloatUiTriggers = NgxFloatUiTriggers
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
  readonly xpertId$ = toObservable(this.team).pipe(map((xpert) => xpert?.id), distinctUntilChanged(), filter(nonBlank))
  readonly conversations$ = this.xpertId$.pipe(
    switchMap((id) => this.chatConversationService.findAllByXpert(id, { order: { updatedAt: OrderTypeEnum.DESC } })),
    map(({items}) => items),
    shareReplay(1)
  )

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
}
