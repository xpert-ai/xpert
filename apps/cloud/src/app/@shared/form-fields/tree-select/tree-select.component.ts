import { booleanAttribute, ChangeDetectionStrategy, Component, computed, effect, forwardRef, input, numberAttribute, signal } from '@angular/core'
import { CommonModule } from '@angular/common'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardComboboxDeprecatedComponent,
  ZardComboboxDeprecatedPanelTemplateDirective,
  type ZardComboboxDeprecatedDisplayWith,
  type ZardComboboxDeprecatedOption,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardFlatTreeControl,
  ZardTreeFlatDataSource,
  ZardTreeFlattener,
  ZardTreeImports
} from '@xpert-ai/headless-ui'
import { DisplayDensity, NgmFieldAppearance, NgmFieldColor, NgmFloatLabel } from '@metad/ocap-angular/core'
import { DisplayBehaviour, TreeNodeInterface } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  displayTreeSelectText,
  findTreeSelectNode,
  filterTreeSelectNodes,
  getInitialExpandedKeys,
  normalizeTreeSelectValue
} from './tree-select.utils'

type TreeSelectFlatNode<T = unknown> = {
  expandable: boolean
  key: string
  label?: string
  caption?: string
  level: number
  raw?: T
}

@Component({
  standalone: true,
  selector: 'xp-tree-select',
  templateUrl: './tree-select.component.html',
  styleUrls: ['./tree-select.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'xp-tree-select ngm-focus-indicator ngm-tree-select',
    '[attr.disabled]': 'disabled() || null',
    '[class.xp-tree-select--tree-viewer]': 'treeViewer()'
  },
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ...ZardFormImports,
    ZardButtonComponent,
    ZardComboboxDeprecatedComponent,
    ZardComboboxDeprecatedPanelTemplateDirective,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardTreeImports,
    TranslateModule
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => XpTreeSelectComponent)
    }
  ]
})
export class XpTreeSelectComponent<T = unknown> implements ControlValueAccessor {
  readonly appearance = input<NgmFieldAppearance>()
  readonly color = input<NgmFieldColor>()
  readonly displayBehaviour = input<DisplayBehaviour | string>(DisplayBehaviour.descriptionOnly)
  readonly displayDensity = input<DisplayDensity | string>()
  readonly floatLabel = input<NgmFloatLabel>()
  readonly initialLevel = input<number | null, number | string | null>(null, {
    transform: (value) => (value === null || value === undefined || value === '' ? null : numberAttribute(value))
  })
  readonly label = input<string>('')
  readonly placeholder = input<string>('')
  readonly searchable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly treeNodes = input<TreeNodeInterface<T>[]>([])
  readonly treeViewer = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly disabled = signal(false)
  readonly searchTerm = signal('')
  readonly value = signal<string | null>(null)

  private readonly treeTransformer = (node: TreeNodeInterface<T>, level: number): TreeSelectFlatNode<T> => ({
    expandable: !!node.children?.length,
    key: String(node.key),
    label: node.label,
    caption: node.caption,
    level,
    raw: node.raw
  })

  readonly treeControl = new ZardFlatTreeControl<TreeSelectFlatNode<T>, string>(
    (node) => node.level,
    (node) => node.expandable,
    {
      trackBy: (node) => node.key
    }
  )
  readonly treeFlattener = new ZardTreeFlattener<TreeNodeInterface<T>, TreeSelectFlatNode<T>, string>(
    this.treeTransformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => node.children
  )
  readonly dataSource = new ZardTreeFlatDataSource<TreeNodeInterface<T>, TreeSelectFlatNode<T>, string>(
    this.treeControl,
    this.treeFlattener,
    []
  )

  readonly triggerMode = computed(() => (this.searchable() ? 'input' : 'button'))
  readonly indentStep = computed(() => {
    const density = this.displayDensity()
    if (density === DisplayDensity.compact) {
      return 10
    }
    if (density === DisplayDensity.cosy) {
      return 12
    }
    return 16
  })
  readonly optionClasses = computed(() => {
    const density = this.displayDensity()
    if (density === DisplayDensity.compact) {
      return 'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs'
    }
    if (density === DisplayDensity.cosy) {
      return 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm'
    }
    return 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm'
  })
  readonly filteredTreeNodes = computed(() =>
    filterTreeSelectNodes(this.treeNodes() ?? [], this.searchTerm(), this.displayBehaviour())
  )
  readonly comboboxNodes = computed(() => this.treeFlattener.flattenNodes(this.filteredTreeNodes() ?? []))
  readonly comboboxOptions = computed<ZardComboboxDeprecatedOption<string, TreeSelectFlatNode<T>>[]>(() =>
    this.comboboxNodes().map((node) => this.asComboboxOption(node))
  )
  readonly selectedNode = computed(() => findTreeSelectNode(this.treeNodes(), this.value()))

  private onChange: (value: string | null) => void = () => undefined
  private onTouched: () => void = () => undefined
  private skipNextSearchTermChange = false

  constructor() {
    effect(() => {
      this.dataSource.data = this.filteredTreeNodes() ?? []
      this.treeControl.collapseAll()

      const expandedKeys = new Set(
        getInitialExpandedKeys(
          this.treeControl.dataNodes.map((node) => ({ key: node.key, level: node.level })),
          this.initialLevel(),
          this.searchTerm()
        )
      )
      for (const node of this.treeControl.dataNodes) {
        if (expandedKeys.has(node.key)) {
          this.treeControl.expand(node)
        }
      }
    })
  }

  writeValue(value: string | null): void {
    this.value.set(normalizeTreeSelectValue(value))
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
  }

  readonly displayWith: ZardComboboxDeprecatedDisplayWith = (option, value) => {
    const key = normalizeTreeSelectValue(value)
    if (!key) {
      return ''
    }

    const optionNode = option?.data as TreeSelectFlatNode<T> | undefined
    return displayTreeSelectText(optionNode) || displayTreeSelectText(findTreeSelectNode(this.treeNodes(), key)) || key
  }

  readonly hasChild = (_: number, node: TreeSelectFlatNode<T>) => node.expandable

  asComboboxOption(node: TreeSelectFlatNode<T>): ZardComboboxDeprecatedOption<string, TreeSelectFlatNode<T>> {
    return {
      id: node.key,
      value: node.key,
      label: this.displayText(node) || node.key,
      data: node
    }
  }

  trackByNode(_index: number, node: TreeSelectFlatNode<T>) {
    return node.key
  }

  treeNodeIndex(node: TreeSelectFlatNode<T>) {
    return this.comboboxNodes().findIndex((item) => item.key === node.key)
  }

  onSearchTermChange(value: string | null) {
    if (this.skipNextSearchTermChange) {
      this.skipNextSearchTermChange = false
      return
    }

    this.searchTerm.set(value ?? '')
  }

  onOpenChange(open: boolean) {
    if (!open || !this.searchable()) {
      return
    }

    this.searchTerm.set('')
  }

  onComboboxValueChange(value: unknown) {
    const normalized = normalizeTreeSelectValue(value)
    this.value.set(normalized)
    this.onChange(normalized)
    this.onTouched()
    this.skipNextSearchTermChange = true
    this.searchTerm.set('')
  }

  markTouched() {
    this.onTouched()
  }

  selectTreeNode(node: TreeSelectFlatNode<T>) {
    if (this.disabled()) {
      return
    }

    this.value.set(node.key)
    this.onChange(node.key)
    this.onTouched()
  }

  isSelected(node: TreeSelectFlatNode<T>) {
    return this.value() === node.key
  }

  isActive(node: TreeSelectFlatNode<T>, activeIndex: number) {
    return this.treeNodeIndex(node) === activeIndex
  }

  displayText(node: Partial<TreeNodeInterface<T> | TreeSelectFlatNode<T>> | null | undefined) {
    return displayTreeSelectText(node)
  }
}
