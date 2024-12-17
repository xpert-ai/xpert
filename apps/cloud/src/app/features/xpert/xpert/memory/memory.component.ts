import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal, TemplateRef, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { CdkConfirmDeleteComponent, NgmCommonModule, TableColumn } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { BehaviorSubject, EMPTY, of } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { CopilotStoreService, getErrorMessage, injectToastr, routeAnimations } from '../../../../@core'
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
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly storeService = inject(CopilotStoreService)
  readonly xpertComponent = inject(XpertComponent)

  readonly xpertId = this.xpertComponent.paramId

  // Children
  readonly actionTemplate = viewChild('actionTemplate', { read: TemplateRef })
  readonly userTemplate = viewChild('userTemplate', { read: TemplateRef })

  readonly loading = signal(false)
  readonly #refresh$ = new BehaviorSubject<void>(null)
  readonly columns = toSignal<TableColumn[]>(
    this.#translate.stream('PAC.Xpert.MemoryCols').pipe(
      map((i18n) => {
        return [
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
            pipe: (value: any) => JSON.stringify(value)
          },
          {
            name: 'actions',
            caption: i18n?.Actions || 'Actions',
            stickyEnd: true,
            cellTemplate: this.actionTemplate
          }
        ]
      })
    )
  )

  readonly items = derivedAsync(() => {
    const id = this.xpertId()
    return id
      ? this.#refresh$.pipe(
          switchMap(() => this.storeService.getAll({ where: { prefix: `${id}` }, relations: ['createdBy'] })),
          map(({ items }) => items)
        )
      : of(null)
  })

  delete(id: string, value: any) {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          value: id,
          information: this.#translate.instant('PAC.Xpert.DeleteTheMemory', {Default: 'Delete the memory'})
            + `:\n` + JSON.stringify(value, null, 2)
            + `\n` + this.#translate.instant('PAC.Xpert.GainMemoryAgain', {Default: 'Can be retriggered to gain memory.'})
        }
      })
      .closed.pipe(switchMap((confirm) => (confirm ? this.storeService.delete(id) : EMPTY)))
      .subscribe({
        next: (result) => {
          this.#refresh$.next()
        },
        error: (err) => {
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
