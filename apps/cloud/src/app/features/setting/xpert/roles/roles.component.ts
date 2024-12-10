import { Component, TemplateRef, inject, signal, viewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmCommonModule, NgmConfirmDeleteComponent, TableColumn } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, EMPTY, catchError, map, switchMap, tap } from 'rxjs'
import { XpertService, IXpertRole, OrderTypeEnum, ToastrService, getErrorMessage, omitSystemProperty } from '../../../../@core'
import { AvatarComponent } from 'apps/cloud/src/app/@shared/files'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

type CopilotRoleRowType = Partial<IXpertRole> & { __edit__?: boolean }

@Component({
  standalone: true,
  selector: 'pac-settings-xpert-roles',
  templateUrl: './roles.component.html',
  styleUrls: ['./roles.component.scss'],
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
export class XpertRolesComponent extends TranslationBaseComponent {
  DisplayBehaviour = DisplayBehaviour

  readonly roleService = inject(XpertService)
  readonly _toastrService = inject(ToastrService)
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
      name: 'title',
      caption: 'Title'
    },
    {
      name: 'titleCN',
      caption: 'Title (CN)'
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

  readonly dataSource = signal<CopilotRoleRowType[]>([])

  readonly displayedColumns = ['avatar', 'name', 'title', 'titleCN', 'description', 'actions']

  private itemsSub = this.#refresh$
    .pipe(
      switchMap(() => this.roleService.getAllInOrg({ order: {updatedAt: OrderTypeEnum.DESC } })),
      map(({ items }) => items),
      takeUntilDestroyed()
    )
    .subscribe((items) => {
      this.dataSource.set(items)
    })

  addRole() {
    // this.dataSource.update((items) => [...items, { __edit__: true }])
    this.#router.navigate(['create'], { relativeTo: this.#route })
  }

  startEdit(item: CopilotRoleRowType) {
    this.#router.navigate([item.id], { relativeTo: this.#route })
    // item.__edit__ = true
  }

  saveEdit(item: CopilotRoleRowType) {
    if (item.id) {
      this.roleService.update(item.id, omitSystemProperty(item)).subscribe({
        next: () => {
          this._toastrService.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
          this.dataSource.update((items) => {
            const index = items.indexOf(item)
            items[index] = { ...item, __edit__: false }
            return [...items]
          })
          // this.refresh$.next()
        },
        error: (err) => {
          this._toastrService.error(getErrorMessage(err))
        }
      })
    } else {
      this.roleService.create(omitSystemProperty(item)).subscribe({
        next: (result) => {
          this._toastrService.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created successfully' })
          this.dataSource.update((items) => {
            const index = items.indexOf(item)
            items[index] = { ...item, __edit__: false, id: result.id }
            return [...items]
          })
          // this.refresh$.next()
        },
        error: (err) => {
          this._toastrService.error(getErrorMessage(err))
        }
      })
    }
  }

  deleteRole(item: CopilotRoleRowType) {
    if (item.id) {
      this.dialog
        .open(NgmConfirmDeleteComponent, {
          data: {
            value: item.title,
            information: this.getTranslation('PAC.Copilot.Roles.SureDeleteRole', {
              Default: 'Are you sure you want to delete this role?'
            })
          }
        })
        .afterClosed()
        .pipe(
          switchMap((result) => {
            if (result) {
              return this.roleService.delete(item.id).pipe(
                tap(() => {
                  this._toastrService.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
                  this.dataSource.update((items) => items.filter((x) => x !== item))
                  // this.refresh$.next()
                }),
                catchError((err) => {
                  this._toastrService.error(getErrorMessage(err))
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
