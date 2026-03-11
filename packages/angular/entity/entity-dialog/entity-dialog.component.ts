import { DragDropModule } from '@angular/cdk/drag-drop'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, OnInit, inject, model, signal } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog'
import { MatListModule } from '@angular/material/list'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatRadioModule } from '@angular/material/radio'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmDisplayBehaviourComponent, NgmSearchComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { DSCoreService, nonNullable } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { catchError, combineLatestWith, distinctUntilChanged, filter, map, of, startWith, switchMap, tap } from 'rxjs'
import { EntitySelectResultType } from '../types'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

export type EntitySelectDataType = {
  dataSources: ISelectOption<string>[]
  dsCoreService: DSCoreService
  registerModel?: (key: string) => Promise<void>
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-entity-dialog',
  templateUrl: './entity-dialog.component.html',
  styleUrls: ['./entity-dialog.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    TranslateModule,
    ScrollingModule,
    ZardButtonComponent,
    MatDialogModule,
    ZardIconComponent,
    MatRadioModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,

    NgmSearchComponent,
    ButtonGroupDirective,
    NgmDisplayBehaviourComponent
  ]
})
export class NgmEntityDialogComponent implements OnInit {
  public readonly data = inject<EntitySelectDataType>(MAT_DIALOG_DATA)

  readonly dialogRef = inject<MatDialogRef<NgmEntityDialogComponent, EntitySelectResultType>>(MatDialogRef)
  readonly #logger = inject(NGXLogger)

  readonly modelKey = model<string>(null)

  readonly search = new FormControl('')
  readonly loading = signal(false)

  readonly entitiesList = signal<ISelectOption[]>([])

  // Selected entity keys
  readonly entities = model<string[]>([])

  private entitiesSub = toObservable(this.modelKey)
    .pipe(
      distinctUntilChanged(),
      filter(nonNullable),
      tap((modelKey) => {
        this.loading.set(true)
        this.data.registerModel?.(modelKey)
        this.entities.set([])
      }),
      switchMap((dataSource) => this.data.dsCoreService.getDataSource(dataSource)),
      switchMap((dataSource) => dataSource.discoverMDCubes().pipe(catchError(() => of([])))),
      map((entitySets) =>
        entitySets.map((item) => ({
          value: item,
          key: item.name,
          caption: item.caption
        }))
      ),
      tap((entities) => {
        this.loading.set(false)
        if (!this.entities().length && entities.length) {
          this.entities.set([entities[0].key])
        }
        if (this.data.dataSources.length === 1 && entities.length === 1) {
          setTimeout(() => {
            this.onApply()
          }, 300)
        }
      }),
      combineLatestWith(
        this.search.valueChanges.pipe(
          startWith(''),
          map((text) => text.trim().toLowerCase())
        )
      ),
      map(([entities, text]) =>
        text
          ? entities.filter(
              (item) => item.caption?.toLowerCase().includes(text) || item.key?.toLowerCase().includes(text)
            )
          : entities
      )
    )
    .subscribe((entities) => this.entitiesList.set(entities))

  ngOnInit(): void {
    if (this.data.dataSources.length === 1) {
      this.modelKey.set(this.data.dataSources[0].key)
    }
  }

  onApply() {
    this.dialogRef.close({
      modelId: this.data.dataSources.find((item) => item.key === this.modelKey())?.value,
      dataSource: this.modelKey(),
      entities: this.entities()
    })
  }

  trackByKey(index: number, item: ISelectOption<unknown>) {
    return item.key
  }
}
