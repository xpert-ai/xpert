import { Component, TemplateRef, inject, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule, NgmConfirmDeleteComponent, TableColumn } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, catchError, EMPTY, map, switchMap, tap } from 'rxjs'
import { getErrorMessage, IXpertToolset, OrderTypeEnum, ToastrService, XpertToolsetService } from '../../../../@core'
import { AvatarComponent } from 'apps/cloud/src/app/@shared/files'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

type XpertToolsetRowType = Partial<IXpertToolset> & { __edit__?: boolean }

@Component({
  standalone: true,
  selector: 'pac-settings-xpert-toolsets',
  templateUrl: './toolsets.component.html',
  styleUrls: ['./toolsets.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    NgmCommonModule,
    AvatarComponent
  ]
})
export class XpertToolsetsComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly dialog = inject(MatDialog)

  readonly actionTemplate = viewChild('actionTemplate', { read: TemplateRef })

  readonly columns = signal<TableColumn[]>([
    {
      name: 'name',
      caption: 'Name'
    },
    {
      name: 'description',
      caption: 'Description'
    },
    {
      name: 'actions',
      caption: 'Actions',
      cellTemplate: this.actionTemplate,
      stickyEnd: true
    }
  ])

  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly dataSource = signal<XpertToolsetRowType[]>([])

  readonly displayedColumns = ['avatar', 'name', 'description', 'actions']

  private itemsSub = this.#refresh$
    .pipe(
      switchMap(() => this.toolsetService.getAllInOrg({ order: { updatedAt: OrderTypeEnum.DESC } })),
      map(({ items }) => items),
      takeUntilDestroyed()
    )
    .subscribe((items) => {
      this.dataSource.set(items)
    })

  createToolset() {
    this.#router.navigate(['create'], { relativeTo: this.#route })
  }

  startEdit(item: XpertToolsetRowType) {
    this.#router.navigate([item.id], { relativeTo: this.#route })
  }

  deleteEntity(item: XpertToolsetRowType) {
    if (item.id) {
      this.dialog
        .open(NgmConfirmDeleteComponent, {
          data: {
            value: item.name,
            information: this.#translate.instant('PAC.Xpert.Toolset.SureDeleteToolset', {
              Default: 'Are you sure you want to delete this toolset?'
            })
          }
        })
        .afterClosed()
        .pipe(
          switchMap((result) => {
            if (result) {
              return this.toolsetService.delete(item.id).pipe(
                tap(() => {
                  this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
                  this.dataSource.update((items) => items.filter((x) => x !== item))
                }),
                catchError((err) => {
                  this.#toastr.error(getErrorMessage(err))
                  return EMPTY
                })
              )
            }
            return EMPTY
          })
        )
        .subscribe()
    } else {
      this.dataSource.update((items) => items.filter((x) => x !== item))
    }
  }

  refresh() {
    this.#refresh$.next()
  }
}
