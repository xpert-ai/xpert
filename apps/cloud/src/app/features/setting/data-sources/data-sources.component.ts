import { Component, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { NgmConfirmDeleteComponent } from '@metad/ocap-angular/common'
import { DataSourceService } from '@metad/cloud/state'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { combineLatestWith, debounceTime, startWith, switchMap, tap, map } from 'rxjs/operators'
import { IDataSource, injectHelpWebsite, ROUTE_ANIMATIONS_ELEMENTS } from '../../../@core/index'
import { PACDataSourceCreationComponent } from './creation/creation.component'
import { PACDataSourceEditComponent } from './edit/edit.component'
import { FormControl } from '@angular/forms'

@Component({
  selector: 'pac-data-sources',
  templateUrl: './data-sources.component.html',
  styleUrls: ['./data-sources.component.scss']
})
export class PACDataSourcesComponent {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS

  private readonly dataSource = inject(DataSourceService)
  private readonly _dialog = inject(MatDialog)
  readonly helpWebsite = injectHelpWebsite()

  loading = false
  private readonly refresh$ = new BehaviorSubject<void>(null)
  readonly searchControl = new FormControl('')
  readonly dataSources = toSignal(
    this.refresh$.pipe(
      tap(() => (this.loading = true)),
      switchMap(() => this.dataSource.getAll(['type'])),
      combineLatestWith(this.searchControl.valueChanges.pipe(
        debounceTime(300),
        map((text) => text?.toLowerCase()),
        startWith('')
      )),
      map(([items, search]) => search ? items.filter((item) => item.name.toLowerCase().includes(search)) : items ),
      tap(() => (this.loading = false))
    )
  )

  async create() {
    const result = await firstValueFrom(this._dialog.open(PACDataSourceCreationComponent).afterClosed())

    if (result) {
      this.refresh$.next()
    }
  }

  async edit(dataSource: IDataSource) {
    const result = await firstValueFrom(
      this._dialog
        .open(PACDataSourceEditComponent, {
          data: {
            id: dataSource.id
          }
        })
        .afterClosed()
    )

    if (result) {
      this.refresh$.next()
    }
  }

  async copy(data: IDataSource) {
    const result = await firstValueFrom(this._dialog.open(PACDataSourceCreationComponent, { data }).afterClosed())

    if (result) {
      this.refresh$.next()
    }
  }

  async remove(data: IDataSource) {
    const result = await firstValueFrom(
      this._dialog.open(NgmConfirmDeleteComponent, { data: { value: data.name } }).afterClosed()
    )

    if (result) {
      await firstValueFrom(this.dataSource.delete(data.id))
      this.refresh$.next()
    }
  }
}
