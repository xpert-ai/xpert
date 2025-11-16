import { CollectionViewer, DataSource, SelectionChange } from '@angular/cdk/collections'
import { FormControl } from '@angular/forms'
import { FlatTreeControl } from '@angular/cdk/tree'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import {
  AggregationRole,
  C_MEASURES,
  Dimension,
  DimensionMemberRecursiveHierarchy,
  EntityProperty,
  EntitySemantics,
  EntityType,
  getEntityDimensions,
  getEntityMeasures,
  getEntityParameters,
  hierarchize,
  IDimensionMember,
  isCalculationProperty,
  isEntityType,
  isIndicatorMeasureProperty,
  PropertyDimension,
  PropertyHierarchy,
  PropertyLevel,
  serializeUniqueName,
  TreeNodeInterface,
  VariableProperty
} from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { flatMap, isEmpty } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  filter,
  first,
  map,
  merge,
  Observable,
  of,
  shareReplay,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap
} from 'rxjs'
import { EntityCapacity, EntitySchemaType } from './types'


export interface EntitySchemaNode extends EntityProperty {
  type?: EntitySchemaType
  raw?: any
}

/** Flat node with expandable and level information */
export class EntitySchemaFlatNode {
  constructor(
    public item: EntitySchemaNode,
    public level = 1,
    public expandable = false,
    public isLoading = false,
    public children = null,
    public error = null
  ) {}
}

export class EntitySchemaDataSource implements DataSource<EntitySchemaFlatNode> {
  private destroy$ = new Subject<void>()
  dataChange = new BehaviorSubject<EntitySchemaFlatNode[]>([])

  readonly searchControl = new FormControl()
  get dataSourceName() {
    return this.dataSourceName$.value
  }
  set dataSourceName(value) {
    this.dataSourceName$.next(value)
  }
  private dataSourceName$ = new BehaviorSubject<string>(null)
  private dataSource$ = this.dataSourceName$.pipe(
    distinctUntilChanged(),
    filter((value) => !!value),
    switchMap((name) => this.dsCoreService.getDataSource(name)),
    takeUntil(this.destroy$),
    shareReplay(1)
  )
  private entity$ = new BehaviorSubject<string>(null)
  private entityService$ = this.entity$.pipe(
    distinctUntilChanged(),
    filter((value) => !!value),
    switchMap((name) => this.dataSource$.pipe(map((dataSource) => dataSource.createEntityService(name)))),
    takeUntil(this.destroy$),
    shareReplay(1)
  )

  get data(): EntitySchemaFlatNode[] {
    return this.dataChange.value
  }
  set data(value: EntitySchemaFlatNode[]) {
    this._treeControl.dataNodes = value
    this.dataChange.next(value)
  }

  private entityType: EntityType

  constructor(
    private _treeControl: FlatTreeControl<EntitySchemaFlatNode>,
    private dsCoreService: NgmDSCoreService,
    private translateService: TranslateService,
    private capacities: EntityCapacity[]
  ) {}

  connect(collectionViewer: CollectionViewer): Observable<EntitySchemaFlatNode[]> {
    this._treeControl.expansionModel.changed.subscribe((change) => {
      if (
        (change as SelectionChange<EntitySchemaFlatNode>).added ||
        (change as SelectionChange<EntitySchemaFlatNode>).removed
      ) {
        this.handleTreeControl(change as SelectionChange<EntitySchemaFlatNode>)
      }
    })

    return merge(collectionViewer.viewChange, this.dataChange).pipe(
      combineLatestWith(this.searchControl.valueChanges.pipe(debounceTime(300), startWith(null), distinctUntilChanged())),
      map(([, text]) => {
        const lowerCaseText = text?.toLowerCase()
        return lowerCaseText ?
          this.data.filter((node) => node.item.type === EntitySchemaType.Entity || 
            node.item.caption?.toLowerCase().includes(lowerCaseText) ||
            node.item.name.toLowerCase().includes(lowerCaseText)
          ) : this.data
      })
    )
  }
  disconnect(collectionViewer: CollectionViewer): void {
    this.destroy$.next()
    this.destroy$.complete()
  }

  /** Handle expand/collapse behaviors */
  handleTreeControl(change: SelectionChange<EntitySchemaFlatNode>) {
    if (change.added) {
      change.added.forEach((node) => this.toggleNode(node, true))
    }
    if (change.removed) {
      change.removed
        .slice()
        .reverse()
        .forEach((node) => this.toggleNode(node, false))
    }
  }

  /**
   * Toggle the node, remove from display list
   */
  toggleNode(node: EntitySchemaFlatNode, expand: boolean) {
    const index = this.data.indexOf(node)
    if (expand) {
      if (node.children) {
        this.data.splice(index + 1, 0, ...node.children)
        // notify the change
        this.dataChange.next(this.data)
      } else if(!node.isLoading) {
        node.isLoading = true
        this.getChildren(node).pipe(takeUntil(this.destroy$)).subscribe({
          next: (children) => {
            const index = this.data.indexOf(node)
            if (index < 0) {
              return
            }
            if (!children?.length) {
              // If no children, or cannot find the node, no op
              node.isLoading = false
              this.data.splice(index, 1, { ...node, expandable: false })
              this.dataChange.next(this.data)
              return
            }

            const nodes = children.map(
              (name) =>
                new EntitySchemaFlatNode(
                  name,
                  node.level + 1,
                  name.type === EntitySchemaType.Member
                    ? !!name.children?.length
                    : name.type === EntitySchemaType.IMeasure
                    ? false
                    : true
                )
            )
            this.data.splice(index + 1, 0, ...nodes)

            node.isLoading = false
            // notify the change
            this.dataChange.next(this.data)
          },
          error: (err) => {
            let error: string
            if (typeof err === 'string') {
              error = err
            } else if (err instanceof Error) {
              error = err?.message
            } else if (err?.error instanceof Error) {
              error = err?.error?.message
            } else {
              error = err
            }

            node.isLoading = false
            this.data.splice(index, 1, { ...node, expandable: false, error })
            // notify the change
            this.dataChange.next(this.data)
          }
        })
      }
    } else {
      let count = 0
      for (let i = index + 1; i < this.data.length && this.data[i].level > node.level; i++, count++) {
        //
      }
      node.children = this.data.splice(index + 1, count)
      // notify the change
      this.dataChange.next(this.data)
    }
  }

  getChildren(node: EntitySchemaFlatNode): Observable<any[]> {
    switch(node.item.type) {
      case EntitySchemaType.Entity: {
        if (this.entityType?.name === node.item.name) {
          // Entity Type has loaded
          return of(this.getEntityTypeChildren(this.entityType))
        }
  
        this.entity$.next(node.item.name)
        return this.dataSource$.pipe(
          switchMap((dataSource) => dataSource.selectEntityType(node.item.name)),
          first(),
          tap((entityType) => {
            if (isEntityType(entityType)) {
              this.entityType = entityType
              node.item.caption = this.entityType?.caption
            } else {
              throw entityType
            }
          }),
          filter(isEntityType),
          map((value) => this.getEntityTypeChildren(value))
        )
      }
      case EntitySchemaType.Dimension: {
        const item = node.item as PropertyDimension
        const hierarchies = item.hierarchies
        
        if (!isEmpty(hierarchies)) {
          // Is Dimension
          return of(hierarchies.map((item) => ({
            ...item,
            type: EntitySchemaType.Hierarchy
          })))
        } else if (!isEmpty(item.members)) {
          // is Measures
          return of(item.members)
        } else {
          return this.entityService$.pipe(
            switchMap((entityService) => entityService.selectMembers({ dimension: node.item.name })),
            first(),
            map((members) => {
              return members.map((item) => ({
                ...item,
                type: EntitySchemaType.Member,
                name: item.memberKey,
                caption: item.memberCaption
              }))
            })
          )
        }
        break
      }
      case EntitySchemaType.Hierarchy: {
        const levels = (node.item as PropertyHierarchy).levels as Omit<PropertyLevel, 'type'>[] as EntitySchemaNode[]
        if (!isEmpty(levels)) {
          const properties = flatMap((node.item as PropertyHierarchy).levels, (level) => level.properties)
            .map((item) => ({...item, type: EntitySchemaType.Field}))
  
          const propertiesCaption = this.getTranslation('Ngm.EntitySchema.Properties', {Default: 'Properties'})
          return of([...levels.map((item) => ({
              ...item,
              type: EntitySchemaType.Level
            })),
            ...(properties.length ? [{
              name: '',
              caption: propertiesCaption,
              members: properties,
              type: EntitySchemaType.Properties
            }] : [])
          ])
        }
        break
      }
      case EntitySchemaType.Level: {
        const item = node.item as any
        return this.selectDimensionMembers({
          dimension: item.dimension,
          hierarchy: item.hierarchy,
        }, item.levelNumber)
      }
      case EntitySchemaType.Member: {
        const members = (node.item as unknown as TreeNodeInterface<IDimensionMember>).children
        return of(members?.map((item) => ({
          ...item,
          type: EntitySchemaType.Member,
          name: item.raw.memberUniqueName
        })) ?? [])
      }
      case EntitySchemaType.Parameter: {
        if (node.item.role === AggregationRole.variable) {
          const item = node.item as VariableProperty
          return this.selectDimensionMembers({
            dimension: item.dimension,
            hierarchy: item.hierarchy,
          })
        }
        break
      }
      default: {
        if (node.item.members) {
          return of(node.item.members)
        }
      }
    }

    return of([])
  }

  selectDimensionMembers(dimension: Dimension, startLevel = 0) {
    return this.entityService$.pipe(
      switchMap((entityService) => entityService.selectMembers(dimension)),
      first(),
      map((members) => {
        const _members = hierarchize<IDimensionMember>(members, DimensionMemberRecursiveHierarchy, {
          startLevel
        })
        return _members.map((item) => ({
          ...item,
          type: EntitySchemaType.Member,
          name: item.raw.memberUniqueName
        }))
      })
    )
  }

  getEntityTypeChildren(entityType: EntityType) {
    const dimensions = this.hasCapability(EntityCapacity.Dimension) ? getEntityDimensions(entityType) : []
    const measures = getEntityMeasures(entityType)
      .filter((measure) => {
        if (isIndicatorMeasureProperty(measure)) {
          return this.hasCapability(EntityCapacity.Indicator)
        } else if (isCalculationProperty(measure)) {
          return this.hasCapability(EntityCapacity.Calculation)
        } else {
          return this.hasCapability(EntityCapacity.Measure)
        }
      })
      .map((item) => ({
        ...item,
        type: EntitySchemaType.IMeasure
      }))

    const parameters = getEntityParameters(entityType).map((item) => ({
      ...item,
      type: EntitySchemaType.Parameter
    }))

    const parametersCaption = this.getTranslation('Ngm.EntitySchema.Parameters', {Default: 'Parameters'})
    const measuresCaption = this.getTranslation('Ngm.EntitySchema.Measures', {Default: 'Measures'})

    const nodes: any[] = [
      ...dimensions.map((item) => ({...item, type: EntitySchemaType.Dimension,
        hierarchies: entityType.semantics === EntitySemantics.table ? null : item.hierarchies
      })),
    ]

    if (this.hasCapability(EntityCapacity.Measure)) {
      nodes.push(
        ...(entityType.semantics === EntitySemantics.aggregate ? [{
          name: serializeUniqueName(C_MEASURES),
          caption: measuresCaption,
          type: EntitySchemaType.Dimension,
          entity: entityType.name,
          members: measures
        }] : measures)
      )
    }

    if (this.hasCapability(EntityCapacity.Parameter) && parameters.length) {
      nodes.push(
        {
          name: 'parameters',
          caption: parametersCaption,
          type: EntitySchemaType.Parameters,
          entity: entityType.name,
          members: parameters
        }
      )
    }
    return nodes
  }

  hasCapability(capability: EntityCapacity) {
    return this.capacities?.includes(capability)
  }

  getTranslation(key: string, params?: any) {
    return this.translateService.instant(key, params)
  }
}
