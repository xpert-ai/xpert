import { CommonModule } from '@angular/common'
import { Component, inject, signal, ViewContainerRef } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { DataSourceService } from '@xpert-ai/cloud/state'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { combineLatestWith, debounceTime, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators'
import { IDataSource } from '@xpert-ai/contracts'
import { ROUTE_ANIMATIONS_ELEMENTS } from '../../../@core/animations'
import { injectHelpWebsite } from '../../../@core/providers/website'
import { PACDataSourceCreationComponent } from './creation/creation.component'
import { PACDataSourceEditComponent } from './edit/edit.component'

import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDialogService,
  ZardEmptyComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardLoaderComponent,
  ZardMenuImports
} from '@xpert-ai/headless-ui'

const DATA_SOURCE_DIALOG_PANEL_CLASS = ['xp-overlay-pane-share-sheet', '!p-0']
const DATA_SOURCE_DIALOG_MAX_WIDTH = 'calc(100vw - 48px)'
const DATA_SOURCE_CREATION_DIALOG_WIDTH = 'min(780px, calc(100vw - 48px))'
const DATA_SOURCE_EDIT_DIALOG_WIDTH = 'min(560px, calc(100vw - 48px))'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardLoaderComponent,
    ...ZardCardImports,
    ...ZardMenuImports
  ],
  selector: 'pac-data-sources',
  templateUrl: './data-sources.component.html',
  styleUrls: ['./data-sources.component.scss']
})
export class PACDataSourcesComponent {
  routeAnimationsElements = ROUTE_ANIMATIONS_ELEMENTS

  private readonly dataSource = inject(DataSourceService)
  readonly #dialog = inject(ZardDialogService)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #viewContainerRef = inject(ViewContainerRef)
  readonly helpWebsite = injectHelpWebsite()

  readonly loading = signal(false)
  private readonly refresh$ = new BehaviorSubject<void>(null)
  readonly searchControl = new FormControl('')
  readonly search$ = this.searchControl.valueChanges.pipe(
    debounceTime(300),
    map((text) => text?.trim().toLowerCase() ?? ''),
    startWith(''),
    shareReplay({ bufferSize: 1, refCount: true })
  )
  readonly searchText = toSignal(this.search$, { initialValue: '' })
  readonly dataSources = toSignal(
    this.refresh$.pipe(
      tap(() => this.loading.set(true)),
      switchMap(() => this.dataSource.getAll(['type'])),
      combineLatestWith(this.search$),
      map(([items, search]) => (search ? items.filter((item) => item.name?.toLowerCase().includes(search)) : items)),
      tap(() => this.loading.set(false))
    ),
    { initialValue: [] }
  )

  create() {
    this.#dialog
      .open(PACDataSourceCreationComponent, {
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: DATA_SOURCE_DIALOG_PANEL_CLASS,
        width: DATA_SOURCE_CREATION_DIALOG_WIDTH,
        maxWidth: DATA_SOURCE_DIALOG_MAX_WIDTH
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
        viewContainerRef: this.#viewContainerRef,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: DATA_SOURCE_DIALOG_PANEL_CLASS,
        width: DATA_SOURCE_EDIT_DIALOG_WIDTH,
        maxWidth: DATA_SOURCE_DIALOG_MAX_WIDTH
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
        panelClass: DATA_SOURCE_DIALOG_PANEL_CLASS,
        width: DATA_SOURCE_CREATION_DIALOG_WIDTH,
        maxWidth: DATA_SOURCE_DIALOG_MAX_WIDTH
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

    this.#alertDialog
      .confirm({
        title: this.#getDeleteTitle(displayName),
        actionText: this.#translate.instant('COMPONENTS.COMMON.Confirm', { Default: 'Confirm' }),
        cancelText: this.#translate.instant('COMPONENTS.COMMON.CANCEL', { Default: 'Cancel' }),
        destructive: true,
        viewContainerRef: this.#viewContainerRef
      })
      .pipe(switchMap((confirm) => (confirm ? this.dataSource.delete(data.id) : EMPTY)))
      .subscribe(() => {
        this.refresh$.next()
      })
  }

  #getDeleteTitle(value?: string) {
    const title = this.#translate.instant('COMPONENTS.CONFIRM.DELETE', { Default: 'Confirm Delete' })
    const name = value == null || value === '' ? null : String(value)

    return name ? `${title} [${name}]?` : `${title}?`
  }
}
