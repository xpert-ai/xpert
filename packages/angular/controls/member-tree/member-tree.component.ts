import { ScrollingModule } from '@angular/cdk/scrolling'
import { FlatTreeControl } from '@angular/cdk/tree'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  EventEmitter,
  forwardRef,
  HostBinding,
  input,
  Output,
  signal
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormControl, NG_VALUE_ACCESSOR } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox'
import { MatIconModule } from '@angular/material/icon'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayDensity, NgmAppearance, OcapCoreModule } from '@metad/ocap-angular/core'
import {
  DataSettings,
  Dimension,
  DisplayBehaviour,
  FilterSelectionType,
  filterTreeNodes,
  FlatTreeNode,
  hierarchize,
  IDimensionMember,
  IMember,
  isEmpty,
  ISlicer,
  PrimitiveType,
  TreeNodeInterface,
  TreeSelectionMode
} from '@metad/ocap-core'
import { uniq } from 'lodash-es'
import { combineLatestWith, distinctUntilChanged, map, startWith } from 'rxjs/operators'
import { NgmSmartFilterService } from '../smart-filter.service'
import { TreeControlOptions } from '../types'

export interface TreeItemFlatNode<T> extends FlatTreeNode<T> {
  checked?: boolean
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-member-tree',
  templateUrl: 'member-tree.component.html',
  styleUrls: ['member-tree.component.scss'],
  providers: [
    NgmSmartFilterService,
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmMemberTreeComponent)
    }
  ],
  imports: [
    CommonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatButtonModule,
    ScrollingModule,
    OcapCoreModule,
    NgmCommonModule
  ]
})
export class NgmMemberTreeComponent<T extends IDimensionMember = IDimensionMember> implements ControlValueAccessor {
  @HostBinding('class.ngm-member-tree') _isMemberTreeComponent = true

  readonly dataSettings = input<DataSettings>()
  readonly dimension = input<Dimension>()

  readonly options = input<TreeControlOptions>()

  get displayBehaviour() {
    return this.dimension()?.displayBehaviour
  }
  get treeSelectionMode() {
    return this.options()?.treeSelectionMode
  }

  readonly appearance = input<NgmAppearance>()
  readonly disabled = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly _disabled = signal(false)

  @Output() loadingChanging = new EventEmitter<boolean>()
  // @Output() change = new EventEmitter<MatCheckboxChange>()

  onChange: (input: any) => void

  itemSize = 40
  treeNodePaddingIndent = 20
  unfold = false
  searchControl = new FormControl()
  /** Map from nested node to flattened node. This helps us to keep the same object for selection */
  nestedNodeMap = new Map<TreeNodeInterface<T>, TreeItemFlatNode<T>>()
  keyNodeMap = new Map<PrimitiveType, TreeItemFlatNode<T>>()
  treeControl: FlatTreeControl<TreeItemFlatNode<T>>
  treeFlattener: MatTreeFlattener<TreeNodeInterface<T>, TreeItemFlatNode<T>>
  dataSource: MatTreeFlatDataSource<TreeNodeInterface<T>, TreeItemFlatNode<T>>

  /** The selection for checklist */
  readonly memberKeys = signal<string[]>([])

  public readonly options$ = toObservable(this.options)
  public readonly onlyLeaves$ = this.options$.pipe(
    map((options) => options?.onlyLeaves),
    distinctUntilChanged()
  )
  public readonly loading$ = this.smartFilterService.loading$

  readonly error = signal<string>(null)

  readonly slicer = computed(() => {
    let nodes = this.memberKeys()
      .map((key) => this.keyNodeMap.get(key))
      .filter(Boolean)
    if (this.options()?.treeSelectionMode === TreeSelectionMode.ChildrenOnly) {
      nodes = nodes.filter(
        (node) =>
          !this.treeControl.isExpandable(node) ||
          !(this.childrenPartiallySelected(node) || this.childrenAllSelected(node))
      )
    } else if (this.options()?.treeSelectionMode === TreeSelectionMode.DescendantsOnly) {
      nodes = nodes.filter(
        (node) =>
          !this.treeControl.isExpandable(node) ||
          !(this.descendantsPartiallySelected(node) || this.descendantsAllSelected(node))
      )
    }

    const slicer: ISlicer = {
      dimension: this.dimension(),
      members: nodes.map(
        (node) =>
          ({
            value: node.key,
            key: node.key,
            caption: node.caption
          }) as IMember
      )
    }
    if (this.isSingleRange()) {
      slicer.selectionType = this.selectionType()
    }
    return slicer
  })

  readonly treeNodes = toSignal(
    this.smartFilterService.membersWithSchema$.pipe(
      combineLatestWith(this.onlyLeaves$),
      map(([{ members, schema }, onlyLeaves]) => {
        if (schema?.recursiveHierarchy) {
          return hierarchize(members, schema?.recursiveHierarchy, { onlyLeaves })
        }
        return null
      })
    )
  )
  readonly autoActiveFirst = computed(() => this.options()?.autoActiveFirst)
  readonly selectionType = computed(() => this.options()?.selectionType)
  readonly isSingleRange = computed(() => this.selectionType() === FilterSelectionType.SingleRange)
  readonly initial = signal(true)

  /**
  |--------------------------------------------------------------------------
  | Effects
  |--------------------------------------------------------------------------
  */
  readonly loadedTreeNodes = effect(() => this.initial.set(true), { allowSignalWrites: true })
  readonly autoActiveFirstEffect = effect(
    () => {
      // Auto active first option when no selection
      const treeNodes = this.treeNodes()
      const firstNode = treeNodes?.[0]
      if (this.autoActiveFirst() && firstNode && this.initial() && isEmpty(this.memberKeys())) {
        this.initial.set(false)
        this.memberKeys.set([firstNode.key])

        const slicer: ISlicer = {
          dimension: this.dimension(),
          members: [
            {
              value: firstNode.key,
              key: firstNode.key,
              caption: firstNode.caption
            } as IMember
          ]
        }
        this.onChange(slicer)
      }
    },
    { allowSignalWrites: true }
  )

  // Subscribers
  private _membersSub = toObservable(this.treeNodes)
    .pipe(
      combineLatestWith(this.searchControl.valueChanges.pipe(startWith(null), distinctUntilChanged())),
      map(([treeNodes, text]) => {
        text = text?.trim()
        if (text) {
          return filterTreeNodes(treeNodes, text, {
            considerKey: this.displayBehaviour !== DisplayBehaviour.descriptionOnly
          })
        }
        return treeNodes
      }),
      takeUntilDestroyed()
    )
    .subscribe((data) => {
      if (data) {
        this.dataSource.data = data as any
        // 初始化数据后展开初始层级深度
        if (this.options()?.initialLevel > 0 || !!this.searchControl.value) {
          this.treeControl.dataNodes.forEach((node) => {
            const level = this.treeControl.getLevel(node)
            if (level < this.options().initialLevel || (this.searchControl.value && node.childrenCardinality === 1)) {
              this.treeControl.expand(node)
            }
          })
        }
      }
    })

  private _refreshSub = this.smartFilterService
    .onAfterServiceInit()
    .pipe(takeUntilDestroyed())
    .subscribe(() => {
      this.smartFilterService.refresh()
    })
  private _loadingSub = this.smartFilterService.loading$.pipe(takeUntilDestroyed()).subscribe((loading) => {
    this.loadingChanging.emit(loading)
  })
  private errorSub = this.smartFilterService.selectResult().pipe(map(({ error }) => error), takeUntilDestroyed()).subscribe((err) => {
    this.error.set(err)
  })

  constructor(private smartFilterService: NgmSmartFilterService) {
    this.treeFlattener = new MatTreeFlattener(this.transformer, this.getLevel, this.isExpandable, this.getChildren)
    this.treeControl = new FlatTreeControl<TreeItemFlatNode<T>>(this.getLevel, this.isExpandable, {
      trackBy: (dataNode: TreeItemFlatNode<T>) => dataNode.key as any
    })
    this.dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener)
    this.dataSource.data = []

    effect(
      () => {
        const options = this.options()

        if (options) {
          this.smartFilterService.options = { ...options, dimension: this.dimension() }

          if (options.defaultMembers) {
            this.memberKeys.set(options.defaultMembers.map((member) => member.key))
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const appearance = this.appearance()
        if (appearance) {
          switch (appearance.displayDensity) {
            case DisplayDensity.compact:
              this.itemSize = 24
              this.treeNodePaddingIndent = 12
              break
            case DisplayDensity.cosy:
              this.itemSize = 30
              this.treeNodePaddingIndent = 15
              break
            default:
              this.itemSize = 40
              this.treeNodePaddingIndent = 20
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const dataSettings = this.dataSettings()
        if (dataSettings) {
          this.smartFilterService.dataSettings = dataSettings
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const dimension = this.dimension()
        if (dimension) {
          this.smartFilterService.options = { ...(this.options ?? {}), dimension }
        }
      },
      { allowSignalWrites: true }
    )
  }

  writeValue(obj: any): void {
    if (Array.isArray(obj?.members)) {
      this.memberKeys.set(obj.members.map(({ key }) => key))
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
    /**
     * Emit default values
     * @todo Whether it is appropriate or not emit in here ？
     */
    if (this.options()?.defaultMembers?.length) {
      this.onChange({
        dimension: this.dimension(),
        members: [...this.options().defaultMembers]
      })
    }
  }
  registerOnTouched(fn: any): void {
    //
  }
  setDisabledState?(isDisabled: boolean): void {
    this._disabled.set(isDisabled)
  }

  refresh(force?: boolean) {
    this.smartFilterService.refresh(force)
  }

  /**
   * Transformer to convert nested node to flat node. Record the nodes in maps for later use.
   */
  transformer = (node: TreeNodeInterface<T>, level: number) => {
    const existingNode = this.nestedNodeMap.get(node)
    const flatNode = existingNode && existingNode.key === node.key ? existingNode : ({} as TreeItemFlatNode<T>)
    flatNode.key = node.key
    flatNode.raw = node.raw
    flatNode.caption = node.caption
    flatNode.level = level
    flatNode.expandable = !!node.children?.length
    flatNode.childrenCardinality = node.children?.length

    this.nestedNodeMap.set(node, flatNode)
    this.keyNodeMap.set(flatNode.key, flatNode)

    return flatNode
  }

  getLevel = (node: TreeItemFlatNode<T>) => node.level
  isExpandable = (node: TreeItemFlatNode<T>) => node.expandable
  getChildren = (node: TreeNodeInterface<any>): TreeNodeInterface<any>[] => node.children

  /** Whether all the descendants of the node are selected. */
  descendantsAllSelected(node: TreeItemFlatNode<T>): boolean {
    const descendants = this.treeControl.getDescendants(node)
    const descAllSelected =
      descendants.length > 0 &&
      descendants.every((child) => {
        return this.isSelected(child.raw)
      })
    return descAllSelected
  }

  /** Whether part of the descendants are selected */
  descendantsPartiallySelected(node: TreeItemFlatNode<T>): boolean {
    const descendants = this.treeControl.getDescendants(node)
    const result = descendants.some((child) => this.isSelected(child.raw))
    return result && (!this.descendantsAllSelected(node) || !this.isSelected(node.raw))
  }

  childrenAllSelected(node: TreeItemFlatNode<T>): boolean {
    const level = this.treeControl.getLevel(node)
    const result = this.treeControl
      .getDescendants(node)
      .filter((node) => node.level === level + 1)
      .every((child) => this.isSelected(child.raw))
    return result
  }

  childrenPartiallySelected(node: TreeItemFlatNode<T>): boolean {
    const result = this.treeControl.getDescendants(node).some((child) => this.isSelected(child.raw))
    return result && (!this.childrenAllSelected(node) || !this.isSelected(node.raw))
  }

  isPartiallySelected(node: TreeItemFlatNode<T>): boolean {
    if (this.options()?.treeSelectionMode === TreeSelectionMode.ChildrenOnly) {
      return this.childrenPartiallySelected(node)
    } else if (this.options()?.treeSelectionMode === TreeSelectionMode.SelfChildren) {
      return this.childrenPartiallySelected(node)
    } else if (this.options()?.treeSelectionMode === TreeSelectionMode.DescendantsOnly) {
      return this.descendantsPartiallySelected(node)
    } else if (this.options()?.treeSelectionMode === TreeSelectionMode.SelfDescendants) {
      return this.descendantsPartiallySelected(node)
    }
    return false
  }

  isSelected(item: T) {
    return this.memberKeys().includes(item.memberKey)
  }

  toggleMemberKey(key: string) {
    this.memberKeys.update((members) => {
      members = members.includes(key) ? members.filter((member) => member !== key) : [...members, key]
      if (this.isSingleRange()) {
        members.splice(0, members.length - 2)
      }
      return members
    })
  }

  selectMembers(...keys: string[]) {
    this.memberKeys.update((members) => uniq([...members, ...keys]))
  }

  deselectMembers(...keys: string[]) {
    this.memberKeys.update((members) => members.filter((item) => keys.indexOf(item) !== -1))
  }

  itemSelectionToggle(node: TreeItemFlatNode<T>, event: MatCheckboxChange) {
    const member = node.raw.memberKey
    this.toggleMemberKey(member)
    
    const level = this.treeControl.getLevel(node)

    if (!this.isSingleRange()) {
      if (
        this.options()?.treeSelectionMode === TreeSelectionMode.ChildrenOnly ||
        this.options()?.treeSelectionMode === TreeSelectionMode.SelfChildren
      ) {
        const children = this.treeControl
          .getDescendants(node)
          .filter((node) => node.level === level + 1)
          .map((node) => node.raw.memberKey)

        this.isSelected(node.raw) ? this.selectMembers(...children) : this.deselectMembers(...children)
      } else if (
        this.options()?.treeSelectionMode === TreeSelectionMode.SelfDescendants ||
        this.options()?.treeSelectionMode === TreeSelectionMode.DescendantsOnly
      ) {
        const descendants = this.treeControl.getDescendants(node).map((node) => node.raw.memberKey)
        this.isSelected(node.raw) ? this.selectMembers(...descendants) : this.deselectMembers(...descendants)
      }
    }

    this.onChange(this.slicer())
  }

  toggleExpand() {
    this.unfold = !this.unfold
    this.unfold ? this.treeControl.expandAll() : this.treeControl.collapseAll()
  }
}
