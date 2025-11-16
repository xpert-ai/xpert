import { DragDropModule } from '@angular/cdk/drag-drop'
import { ScrollingModule } from '@angular/cdk/scrolling'
import { FlatTreeControl } from '@angular/cdk/tree'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Input,
  OnInit,
  booleanAttribute,
  effect,
  inject,
  input
} from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatTreeModule } from '@angular/material/tree'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NgmAppearance, NgmDSCoreService, OcapCoreModule } from '@metad/ocap-angular/core'
import { DataSettings, DIMENSION_MEMBER_FIELDS, DisplayBehaviour, IDimensionMember, TreeNodeInterface } from '@metad/ocap-core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { A11yModule } from '@angular/cdk/a11y'
import { EntitySchemaDataSource, EntitySchemaFlatNode, EntitySchemaNode } from './data-source'
import { EntityCapacity, EntitySchemaType } from './types'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    A11yModule,
    MatTreeModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    DragDropModule,
    ScrollingModule,
    TranslateModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    
    NgmCommonModule,
    OcapCoreModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-entity-schema',
  templateUrl: 'entity-schema.component.html',
  styleUrls: ['entity-schema.component.scss']
})
export class NgmEntitySchemaComponent implements OnInit {
  EntitySchemaType = EntitySchemaType
  @HostBinding('class.ngm-entity-schema') _isEntitySchemaComponent = true
  private translateService = inject(TranslateService)
  private _dsCoreService? = inject(NgmDSCoreService, {optional: true})

  @Input() dsCoreService: NgmDSCoreService
  @Input() appearance: NgmAppearance
  @Input() selectedHierarchy: string
  @Input() capacities: EntityCapacity[] = [
    EntityCapacity.Dimension,
    EntityCapacity.Measure,
  ]
  readonly dragDisabled = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly dataSettings = input<DataSettings>()
  readonly displayBehaviour = input<string | DisplayBehaviour>(DisplayBehaviour.auto)

  get searchControl() {
    return this.dataSource.searchControl
  }

  constructor() {
    effect(() => {
      const dataSettings = this.dataSettings()
      if (dataSettings?.entitySet) {
        this.dataSource.dataSourceName = dataSettings.dataSource
        const rootNode = new EntitySchemaFlatNode(
          {
            type: EntitySchemaType.Entity,
            name: dataSettings.entitySet,
            // caption: dataSettings.entitySet,
          },
          0,
          true
        )
        this.dataSource.data = [
          rootNode
        ]
      }
    })
  }

  ngOnInit() {
    if (this.dsCoreService) {
      this._dsCoreService = this.dsCoreService
    }
    this.treeControl = new FlatTreeControl<EntitySchemaFlatNode>(this.getLevel, this.isExpandable)
    this.dataSource = new EntitySchemaDataSource(this.treeControl, this._dsCoreService, this.translateService, this.capacities)

    this.dataSource.data = []
  }

  treeControl: FlatTreeControl<EntitySchemaFlatNode>

  dataSource: EntitySchemaDataSource

  getLevel = (node: EntitySchemaFlatNode) => node.level

  isExpandable = (node: EntitySchemaFlatNode) => node.expandable

  hasChild = (_: number, _nodeData: EntitySchemaFlatNode) => _nodeData.expandable

  memberTooltip(node: EntitySchemaNode) {
    if (node?.type !== EntitySchemaType.Member) return null
    const member = node.raw as IDimensionMember
    return DIMENSION_MEMBER_FIELDS.map(field => {
      const value = member[field.key]
      if (value !== undefined && value !== null) {
        const displayValue = field.formatter ? field.formatter(value) : value
        return `${this.translateService.instant('Ngm.EntitySchema.' + field.label, {Default: field.label})}: ${displayValue}`
      }
      return null
    }).filter(line => line !== null).join('\n')
  }
}
