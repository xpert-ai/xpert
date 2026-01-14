import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatSelectModule } from '@angular/material/select'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmDSCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
import { Join, Table } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { cloneDeep, isEqual, values } from 'lodash-es'
import { BehaviorSubject, EMPTY, map, shareReplay } from 'rxjs'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,

    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    MatButtonModule,
    TranslateModule,

    OcapCoreModule,
    NgmCommonModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-tables-join',
  templateUrl: 'tables-join.component.html',
  styleUrls: ['tables-join.component.scss']
})
export class TablesJoinComponent implements OnInit {
  private dsCoreService = inject(NgmDSCoreService)

  @Input() dataSource: string

  @Input()
  get tables() {
    return this.tables$.value
  }
  set tables(value) {
    if (!isEqual(value, this.tables)) {
      this.tables$.next(cloneDeep(value))
    }
  }
  public tables$ = new BehaviorSubject<Table[]>([])

  @Output() tablesChange = new EventEmitter<Table[]>()

  private _tableTypes = {}

  ngOnInit() {
    this.tables$.subscribe((value) => this.tablesChange.emit(cloneDeep(value)))
  }

  trackById(index: number, item: Table) {
    return item.name
  }

  removeTable(table: Table) {
    const index = this.tables?.findIndex((item) => item.name === table.name)
    if (index > -1) {
      this.tables.splice(index, 1)
      this.tables = [...this.tables]
    }
    this.tables$.next(this.tables)
  }

  changeJoinType(table: Table, type: Join['type']) {
    table.join = table.join ?? { type, fields: [] }
    table.join.type = type
    this.tables$.next(this.tables)
  }

  changeLeftKey(table: Table, index: number, key: string) {
    table.join.fields[index].leftKey = key
    this.tables$.next(this.tables)
  }
  changeRightKey(table: Table, index: number, key: string) {
    table.join.fields[index].rightKey = key
    this.tables$.next(this.tables)
  }

  addJoinField(table: Table) {
    table.join.fields = table.join.fields ?? []
    table.join.fields.push({
      leftKey: null,
      rightKey: null
    })
    this.tables$.next(this.tables)
  }

  removeJoinField(table: Table, index: number) {
    table.join.fields.splice(index, 1)
    this.tables$.next(this.tables)
  }

  selectLeftTableFields(table: Table) {
    const index = this.tables.findIndex((item) => item.name === table.name)
    const leftTable = this.tables[index - 1]
    return this.selectTableType(leftTable)
  }

  selectTableType(table: Table) {
    if (table?.name) {
      if (!this._tableTypes[table.name]) {
        this._tableTypes[table?.name] = this.dsCoreService.selectEntitySet(this.dataSource, table.name).pipe(
          map(({ entityType }) =>
            values(entityType?.properties).map((item) => ({ value: item.name, caption: item.caption }))
          ),
          shareReplay(1)
        )
      }
      return this._tableTypes[table.name]
    }

    return EMPTY
  }
}
