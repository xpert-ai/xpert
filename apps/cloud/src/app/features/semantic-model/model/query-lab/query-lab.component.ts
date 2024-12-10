import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, Optional, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { CommandDialogComponent } from '@metad/copilot-angular'
import { IsDirty } from '@metad/core'
import { cloneDeep } from '@metad/ocap-core'
import { ModelQuery, ModelQueryService, convertModelQueryResult } from 'apps/cloud/src/app/@core'
import { orderBy } from 'lodash-es'
import { distinctUntilChanged, map, switchMap } from 'rxjs'
import { TranslationBaseComponent } from '../../../../@shared/language'
import { ModelEntityService } from '../entity/entity.service'
import { SemanticModelService } from '../model.service'
import { ModelQueryState } from '../types'
import { QueryLabService } from './query-lab.service'
import { ModelComponent } from '../model.component'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-model-query-lab',
  templateUrl: 'query-lab.component.html',
  styleUrls: ['query-lab.component.scss'],
  host: {
    class: 'pac-model-query-lab'
  },
  providers: [QueryLabService]
})
export class QueryLabComponent extends TranslationBaseComponent implements IsDirty {
  readonly _dialog = inject(MatDialog)
  readonly queryService = inject(ModelQueryService)
  readonly #model = inject(ModelComponent)

  readonly modelSideMenuOpened= this.#model.sideMenuOpened

  readonly queries = toSignal(this.queryLabService.queries$.pipe(map((queries) => orderBy(queries, ['index']))))

  private readonly modelId = toSignal(this.modelService.modelId$)

  private queriesSub = this.modelService.modelId$.pipe(
    distinctUntilChanged(),
    switchMap((modelId) => this.queryService.getByModel(modelId))
  ).subscribe((queries) => {
    this.queryLabService.init({
      modelId: this.modelId(),
      queries: queries.map((query) => {
        return {
          key: query.key,
          origin: cloneDeep(query),
          query: query,
          dirty: false,
          results: []
        } as ModelQueryState
      })
    })
  })

  constructor(
    public modelService: SemanticModelService,
    private queryLabService: QueryLabService,
    private route: ActivatedRoute,
    private router: Router,

    @Optional()
    public entityService?: ModelEntityService
  ) {
    super()
  }

  trackByKey(i: number, item: any) {
    return item.key
  }

  isQueryDirty(key: string) {
    return this.queryLabService.dirty[key]
  }

  isDirty() {
    return this.queryLabService.isDirty
  }

  addQuery() {
    const key = this.queryLabService.newQuery('')
    this.router.navigate(['.', key], { relativeTo: this.route })
  }

  aiAddQuery() {
    this.addQuery()
    this._dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        data: {
          commands: ['query']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }

  deleteQuery(key: string) {
    this.queryLabService.deleteQuery(key)
  }

  renameQuery(key: string) {
    this.queryLabService.renameQuery(key)
  }

  sortQueries(event: CdkDragDrop<ModelQuery[]>) {
    const queries = this.queries()
    moveItemInArray(queries, event.previousIndex, event.currentIndex)
    this.queryLabService.updateOrders(queries.map((query, index) => ({ key: query.key, index })))
  }

  openSideMenu() {
    this.modelSideMenuOpened.set(true)
  }
}
