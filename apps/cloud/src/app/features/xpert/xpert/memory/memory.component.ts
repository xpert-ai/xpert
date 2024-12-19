import { A11yModule } from '@angular/cdk/a11y'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { RouterModule } from '@angular/router'
import { CdkConfirmDeleteComponent, NgmCommonModule, TableColumn } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, of, Subscription } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { CopilotStoreService, getErrorMessage, injectToastr, injectTranslate, routeAnimations, XpertService } from '../../../../@core'
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

  readonly data = signal([])

  readonly items = derivedAsync(() => {
    const id = this.xpertId()
    return id
      ? this.#refresh$.pipe(
          switchMap(() => this.storeService.getAll({ where: { prefix: `${id}` }, relations: ['createdBy'] })),
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

  search() {
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

      this.search()
      this.input.set('')
      event.preventDefault()
    }
  }
}
