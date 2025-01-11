import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { RouterModule } from '@angular/router'
import { CdkConfirmDeleteComponent, NgmCommonModule, TableColumn } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, of, Subscription } from 'rxjs'
import { debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import { CopilotStoreService, getErrorMessage, injectToastr, injectTranslate, LongTermMemoryTypeEnum, routeAnimations, XpertService } from '../../../../@core'
import { UserProfileInlineComponent } from '../../../../@shared/user'
import { XpertComponent } from '../xpert.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    A11yModule,
    MatInputModule,
    NgmCommonModule,
    CdkMenuModule,
    UserProfileInlineComponent
  ],
  selector: 'xpert-memory',
  templateUrl: './memory.component.html',
  styleUrl: 'memory.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryComponent {
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

  readonly loading = signal(false)
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

  readonly searchControl = new FormControl('')
  readonly search = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300), startWith('')))

  readonly data = signal([])
  readonly filterdData = computed(() => {
    const search = this.search()?.toLowerCase()
    if (search) {
      return this.data().filter((item) => JSON.stringify(item.value).includes(search))
    }
    return this.data()
  })

  readonly items = derivedAsync(() => {
    const id = this.xpertId()
    return id
      ? this.#refresh$.pipe(
          switchMap(() => this.xpertService.getAllMemory(id, ['', LongTermMemoryTypeEnum.QA, LongTermMemoryTypeEnum.PROFILE])),
          map(({ items }) => items)
        )
      : of(null)
  })

  readonly input = model<string>()

  private searchSub: Subscription

  constructor() {
    effect(() => {
      if (this.items()) {
        this.data.set(this.items())
      }
    }, { allowSignalWrites: true })
  }

  clearMemory() {
    this.#dialog
    .open(CdkConfirmDeleteComponent, {
      data: {
        information:
          this.#translate.instant('PAC.Xpert.ClearAllMemoryOfXpert', { Default: 'Clear all memories related to this expert' })
      }
    })
    .closed.pipe(switchMap((confirm) => (confirm ? this.xpertService.clearMemory(this.xpertId()) : EMPTY)))
    .subscribe({
      next: (result) => {
        console.log(result)
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
    this.loading.set(true)
    return this.storeService.delete(id).pipe(tap({
      finalize: () => {
        this.loading.set(false)
      }
    }))
  }

  onSearch() {
    this.loading.set(true)
    this.searchSub = this.xpertService.searchMemory(this.xpertId(), { text: this.input(), isDraft: true }).subscribe({
      next: (results) => {
        this.loading.set(false)
        this.data.set(results)
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      },
    })
  }

  stop() {
    this.loading.set(false)
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
