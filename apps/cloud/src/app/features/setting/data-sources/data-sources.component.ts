import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { DataSourceService } from '@metad/cloud/state'
import { injectConfirmDelete, NgmSearchComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject } from 'rxjs'
import { combineLatestWith, debounceTime, map, startWith, switchMap, tap } from 'rxjs/operators'
import { IDataSource, injectHelpWebsite, ROUTE_ANIMATIONS_ELEMENTS } from '../../../@core/index'
import { CardCreateComponent } from '../../../@shared/card'
import { PACDataSourceCreationComponent } from './creation/creation.component'
import { PACDataSourceEditComponent } from './edit/edit.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    TranslateModule,
    NgmSearchComponent,
    ContentLoaderModule,
    CardCreateComponent,
    NgmSpinComponent
  ],
  selector: 'pac-data-sources',
  templateUrl: './data-sources.component.html',
  styleUrls: ['./data-sources.component.scss']
})
export class PACDataSourcesComponent {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS

  private readonly dataSource = inject(DataSourceService)
  private readonly _dialog = inject(MatDialog)
  readonly #dialog = inject(Dialog)
  readonly confirmDelete = injectConfirmDelete()
  readonly helpWebsite = injectHelpWebsite()

  readonly loading = signal(false)
  private readonly refresh$ = new BehaviorSubject<void>(null)
  readonly searchControl = new FormControl('')
  readonly dataSources = toSignal(
    this.refresh$.pipe(
      tap(() => this.loading.set(true)),
      switchMap(() => this.dataSource.getAll(['type'])),
      combineLatestWith(
        this.searchControl.valueChanges.pipe(
          debounceTime(300),
          map((text) => text?.toLowerCase()),
          startWith('')
        )
      ),
      map(([items, search]) => (search ? items.filter((item) => item.name.toLowerCase().includes(search)) : items)),
      tap(() => this.loading.set(false))
    )
  )

  create() {
    this.#dialog
      .open(PACDataSourceCreationComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (result) => {
          if (result) {
            this.refresh$.next()
          }
        }
      })
  }

  edit(dataSource: IDataSource) {
    this.#dialog
      .open(PACDataSourceEditComponent, {
        data: {
          id: dataSource.id
        },
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (result) => {
          if (result) {
            this.refresh$.next()
          }
        }
      })
  }

  copy(data: IDataSource) {
    this.#dialog
      .open(PACDataSourceCreationComponent, {
        data,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet'
      })
      .closed.subscribe({
        next: (result) => {
          if (result) {
            this.refresh$.next()
          }
        }
      })
  }

  remove(data: IDataSource) {
    // Get the latest data source information from the current list
    // to ensure we show the updated name even if the data object is stale
    const currentDataSource = this.dataSources()?.find((item) => item.id === data.id)
    const displayName = currentDataSource?.name || data.name

    this.confirmDelete(
      {
        value: displayName,
        information: ''
      },
      this.dataSource.delete(data.id)
    ).subscribe(() => {
      this.refresh$.next()
    })
  }
}
