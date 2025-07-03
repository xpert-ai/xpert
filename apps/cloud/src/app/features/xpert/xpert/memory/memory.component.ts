import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  TemplateRef,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { CdkConfirmDeleteComponent, NgmSearchComponent, NgmSpinComponent, NgmTableComponent, TableColumn } from '@metad/ocap-angular/common'
import { myRxResource } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, EMPTY, of, Subscription } from 'rxjs'
import { debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import {
  CopilotStoreService,
  DateRelativePipe,
  getErrorMessage,
  injectToastr,
  injectTranslate,
  LongTermMemoryTypeEnum,
  routeAnimations,
  XpertService
} from '../../../../@core'
import { UserProfileInlineComponent } from '../../../../@shared/user'
import { XpertComponent } from '../xpert.component'
import { OverlayAnimation1 } from '@metad/core'
import { NgxJsonViewerModule } from 'ngx-json-viewer'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    A11yModule,
    CdkMenuModule,
    NgxJsonViewerModule,
    NgmSelectComponent,
    NgmTableComponent,
    NgmSpinComponent,
    NgmSearchComponent,
    UserProfileInlineComponent,
    DateRelativePipe
  ],
  selector: 'xpert-memory',
  templateUrl: './memory.component.html',
  styleUrl: 'memory.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryComponent {
  eLongTermMemoryTypeEnum = LongTermMemoryTypeEnum

  readonly #translate = inject(TranslateService)
  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly storeService = inject(CopilotStoreService)
  readonly xpertService = inject(XpertService)
  readonly xpertComponent = inject(XpertComponent)

  readonly xpertId = this.xpertComponent.paramId

  // Children
  readonly scoreTemplate = viewChild('scoreTemplate', { read: TemplateRef })
  readonly actionTemplate = viewChild('actionTemplate', { read: TemplateRef })
  readonly valueTemplate = viewChild('valueTemplate', { read: TemplateRef })
  readonly userTemplate = viewChild('userTemplate', { read: TemplateRef })
  readonly dateTemplate = viewChild('dateTemplate', { read: TemplateRef })

  readonly #loading = signal(false)
  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly columns = computed(() => {
    const i18n = this.colI18n()
    return [
      {
        name: 'score',
        caption: i18n.Score || 'Score',
        cellTemplate: this.scoreTemplate
      },
      {
        name: 'createdBy',
        caption: i18n.CreatedBy || 'Created By',
        cellTemplate: this.userTemplate
      },
      {
        name: 'createdAt',
        caption: i18n.CreatedAt || 'Created At',
        cellTemplate: this.dateTemplate
      },
      {
        name: 'key',
        caption: i18n.Key || 'Key'
      },
      {
        name: 'value',
        caption: i18n.Value || 'Value',
        cellTemplate: this.valueTemplate
      },
      {
        name: 'actions',
        caption: i18n?.Actions || 'Actions',
        stickyEnd: true,
        cellTemplate: this.actionTemplate
      }
    ] as TableColumn[]
  })

  readonly memoryTypesOptions = [
    {
      value: LongTermMemoryTypeEnum.QA,
      label: this.#translate.instant('PAC.Xpert.LongTermMemoryTypeEnum.QuestionAnswer', { Default: 'Q&A' })
    },
    {
      value: LongTermMemoryTypeEnum.PROFILE,
      label: this.#translate.instant('PAC.Xpert.LongTermMemoryTypeEnum.UserProfile', { Default: 'Profile' })
    }
  ]

  readonly searchControl = new FormControl('')
  readonly search = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300), startWith('')))
  readonly memoryType = model<LongTermMemoryTypeEnum>(LongTermMemoryTypeEnum.PROFILE)

  readonly data = signal([])
  readonly filterdData = computed(() => {
    const search = this.search()?.toLowerCase()
    if (search) {
      return this.data().filter((item) => JSON.stringify(item.value).includes(search))
    }
    return this.data()
  })

  readonly #memories = myRxResource({
    request: () => ({ xpertId: this.xpertId(), type: this.memoryType() }),
    loader: ({ request }) => {
      return request.xpertId
        ? this.#refresh$.pipe(
            switchMap(() => this.xpertService.getAllMemory(request.xpertId, [request.type || ''])),
            map(({ items }) => items)
          )
        : of(null)
    }
  })
  readonly loading = computed(() => this.#memories.status() === 'loading' || this.#loading())

  readonly input = model<string>()

  private searchSub: Subscription

  constructor() {
    effect(
      () => {
        if (this.#memories.value()) {
          this.data.set(this.#memories.value())
        }
      },
      { allowSignalWrites: true }
    )
  }

  // Adding memories
  readonly showAddMemory = signal(false)
  readonly question = model<string>()
  readonly answer = model<string>()
  readonly context = model<string>()
  readonly profile = model<string>()
  readonly addMemoryDisabled = computed(() => this.memoryType() === LongTermMemoryTypeEnum.QA 
    ? !this.question() || !this.answer() : !this.profile() || !this.context())
  addMemory() {
    this.#loading.set(true)
    this.xpertService.addMemory(this.xpertId(), {
      type: this.memoryType(),
      value: this.memoryType() === LongTermMemoryTypeEnum.QA ? {question: this.question(), answer: this.answer()} : {
        profile: this.profile(),
        context: this.context()
      }
    }).subscribe({
      next: (result) => {
        this.#loading.set(false)
        this.showAddMemory.set(false)
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      },
    })
    
  }
  toggleAddMemory() {
    this.showAddMemory.update((value) => !value)
  }

  clearMemory() {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          information: this.#translate.instant('PAC.Xpert.ClearAllMemoryOfXpert', {
            Default: 'Clear all memories related to this expert'
          })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.xpertService.clearMemory(this.xpertId()) : EMPTY)))
      .subscribe({
        next: (result) => {
          this.#refresh$.next()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  delete(id: string, value: any) {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: id,
          information:
            this.#translate.instant('PAC.Xpert.DeleteTheMemory', { Default: 'Delete the memory' }) +
            `:\n` +
            JSON.stringify(value, null, 2) +
            `\n` +
            this.#translate.instant('PAC.Xpert.GainMemoryAgain', { Default: 'Can be retriggered to gain memory.' })
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this._delete(id) : EMPTY)))
      .subscribe({
        next: (result) => {
          this.#refresh$.next()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  private _delete(id: string) {
    this.#loading.set(true)
    return this.storeService.delete(id).pipe(
      tap({
        finalize: () => {
          this.#loading.set(false)
        }
      })
    )
  }

  onSearch() {
    this.#loading.set(true)
    this.searchSub = this.xpertService.searchMemory(this.xpertId(), { type: this.memoryType(), text: this.input(), isDraft: true }).subscribe({
      next: (results) => {
        this.#loading.set(false)
        this.data.set(results)
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  stop() {
    this.#loading.set(false)
    this.searchSub?.unsubscribe()
    this.searchSub = null
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.isComposing || event.shiftKey) {
        return
      }

      this.onSearch()
      this.input.set('')
      event.preventDefault()
    }
  }
}
