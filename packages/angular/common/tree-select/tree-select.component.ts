import { BooleanInput, coerceBooleanProperty } from '@angular/cdk/coercion'
import { SelectionModel } from '@angular/cdk/collections'
import { COMMA, ENTER } from '@angular/cdk/keycodes'
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling'
import { FlatTreeControl } from '@angular/cdk/tree'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  inject,
  input,
  Input,
  model,
  OnChanges,
  output,
  SimpleChanges,
  ViewChild
} from '@angular/core'
import { ControlValueAccessor, FormControl, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule, ValidatorFn } from '@angular/forms'
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { MatCheckboxChange } from '@angular/material/checkbox'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatChipsModule } from '@angular/material/chips'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSelectModule } from '@angular/material/select'
import { MatTreeModule } from '@angular/material/tree'
import { DensityDirective, OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { FloatLabelType, MatFormFieldAppearance } from '@angular/material/form-field'
import { MatTreeFlatDataSource, MatTreeFlattener } from '@angular/material/tree'
import { DisplayDensity } from '@metad/ocap-angular/core'
import { DisplayBehaviour, filterTreeNodes, findTreeNode, FlatTreeNode, TreeNodeInterface } from '@metad/ocap-core'
import { isEqual } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatest,
  combineLatestWith,
  delay,
  distinctUntilChanged,
  filter,
  map,
  of,
  startWith,
} from 'rxjs'
import { NgmSearchComponent } from '../search/search.component'
import { CommonModule } from '@angular/common'
import { NgmDisplayBehaviourComponent } from '../display-behaviour'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ThemePalette } from '@angular/material/core'

/**
 * @deprecated use headless components instead
 * 
 * TreeSelect 组件分为三种展示模式:
 * 1. Select 形式, 树型选项列表以弹出列表的形式.
 * 2. Autocomplete 形式, 输入框可输入搜索条件进行过滤, 树型选项列表以下拉列表的形式展示.
 * 3. TreeViewer 形式, 树型选项列表以视图的方式平铺展示出来.
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    
    FormsModule,
    ReactiveFormsModule,
    NgmSearchComponent,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatAutocompleteModule,
    ScrollingModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatInputModule,
    MatChipsModule,
    MatTreeModule,
    TranslateModule,

    OcapCoreModule,
    NgmDisplayBehaviourComponent,
    DensityDirective
  ],
  selector: 'ngm-tree-select',
  templateUrl: 'tree-select.component.html',
  styleUrls: ['tree-select.component.scss'],
  host: {
    '[attr.disabled]': 'disabled() || null',
    '[class._ngm-animation-noopable]': '_animationMode === "NoopAnimations"',
    // Add a class for disabled button styling instead of the using attribute
    // selector or pseudo-selector.  This allows users to create focusabled
    // disabled buttons without recreating the styles.
    '[class.ngm-tree-select-disabled]': 'disabled()',
    class: 'ngm-focus-indicator ngm-tree-select'
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => NgmTreeSelectComponent)
    }
  ]
})
export class NgmTreeSelectComponent<T> implements OnChanges, ControlValueAccessor
{
  readonly #destroyRef = inject(DestroyRef)
  
  @Input() appearance: MatFormFieldAppearance
  @Input() floatLabel: FloatLabelType
  @Input() displayBehaviour: DisplayBehaviour | string
  @Input() displayDensity: DisplayDensity | string
  @Input() label: string
  @Input() placeholder: string
  @Input() validators: ValidatorFn | ValidatorFn[] | null
  readonly panelWidth = input<string | number | null>(null)

  @Input() get treeNodes(): TreeNodeInterface<T>[] {
    return this.treeNodes$.value
  }
  set treeNodes(value) {
    this.treeNodes$.next(value)
  }
  private treeNodes$ = new BehaviorSubject<TreeNodeInterface<T>[]>(null)

  @Input() initialLevel: number

  @Input() get multiple() {
    return this._multiple
  }
  set multiple(value: boolean | string) {
    this._multiple = coerceBooleanProperty(value)
  }
  private _multiple = false

  /**
   * Max Count for autocomplete chips
   */
  @Input() maxTagCount: number

  @Input() get virtualScroll() {
    return this._virtualScroll
  }
  set virtualScroll(value: BooleanInput) {
    this._virtualScroll = coerceBooleanProperty(value)
  }
  private _virtualScroll = false

  readonly autocomplete = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly searchable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  
  readonly treeViewer = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  /**
   * Whether the first option should be highlighted when the autocomplete panel is opened.
   */
  @Input()
  get autoActiveFirstOption(): boolean {
    return this._autoActiveFirstOption;
  }
  set autoActiveFirstOption(value: BooleanInput) {
    this._autoActiveFirstOption = coerceBooleanProperty(value);
  }
  private _autoActiveFirstOption: boolean;

  /** Whether the active option should be selected as the user is navigating. */
  @Input()
  get autoSelectActiveOption(): boolean {
    return this._autoSelectActiveOption;
  }
  set autoSelectActiveOption(value: BooleanInput) {
    this._autoSelectActiveOption = coerceBooleanProperty(value);
  }
  private _autoSelectActiveOption: boolean;

  readonly disabled = model<boolean>(false)
  readonly color = input<ThemePalette>()
  readonly loading = input(false)

  readonly focus = output<FocusEvent>()
  readonly blur = output<FocusEvent>()

  @ViewChild('autoInput') autoInput: ElementRef<HTMLInputElement>
  @ViewChild(CdkVirtualScrollViewport, { static: false })
  cdkVirtualScrollViewPort: CdkVirtualScrollViewport

  get useAutocomplete() {
    return this.autocomplete() || this.virtualScroll
  }

  formControl = new FormControl<FlatTreeNode<any>[] | FlatTreeNode<any>>(null)
  get value() {
    return this.formControl.value
  }
  get isNotInitial() {
    return (
      this.multipleSelection.selected?.length ||
      this.singleSelection.selected?.length ||
      (Array.isArray(this.formControl.value) ? this.formControl.value.length : this.formControl.value)
    )
  }

  autoControl = new FormControl<string>(null)
  get autoHighlight() {
    return typeof this.autoControl.value === 'string' ? this.autoControl.value : null
  }

  /**
   * Tree expand status
   */
  unfold = false
  separatorKeysCodes: number[] = [ENTER, COMMA]
  public multipleSelection = new SelectionModel<string>(true)
  public singleSelection = new SelectionModel<string>(false)

  virtualScrollItemSize = 48
  treeNodePaddingIndent = 20
  private transformer = (node: TreeNodeInterface<any>, level: number): FlatTreeNode<any> => {
    return {
      expandable: !!node.children && node.children.length > 0,
      key: node.key,
      label: node.label,
      caption: node.caption,
      value: node.value,
      level: level,
      childrenCardinality: node.children?.length,
      raw: node.raw
    }
  }
  treeControl = new FlatTreeControl<FlatTreeNode<any>>(
    (node) => node.level,
    (node) => node.expandable
  )
  treeFlattener = new MatTreeFlattener(
    this.transformer,
    (node) => node.level,
    (node) => node.expandable,
    (node) => node.children
  )
  dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener)
  selectOptions$ = this.dataSource.connect({ viewChange: of() })

  // Display selected option in only single select mode
  public readonly selectedOptions$ = this.formControl.valueChanges.pipe(
    startWith(this.formControl.value),
    map((value) => value ? (Array.isArray(value) ? value : [value]) : null)
  )
  
  public readonly trigger$ = this.selectedOptions$.pipe(
    map((selectedOptions) => selectedOptions?.map(({ label, key }) => label || key) ?? this.placeholder)
  )

  public restChips: any[]
  public readonly chipList$ = combineLatest([
    this.singleSelection.changed.pipe(startWith(null)),
    this.multipleSelection.changed.pipe(startWith(null)),
    this.treeNodes$
  ]).pipe(
    map(([event, event2, dataNodes]) => {
      const members = (this.multiple ? this.multipleSelection.selected : this.singleSelection.selected)?.map(
        (key) => findTreeNode(dataNodes, key) ?? { key, label: '' } as TreeNodeInterface<unknown>
      )
      this.restChips = this.maxTagCount ? members.splice(this.maxTagCount) : null

      return members
    }),
  )

  allSelect = false
  onChange: (input: any) => void

  // Subscribers
  // Update the formContrl value as the ref of tree nodes when select options data changed
  private _nodesSub = this.treeNodes$.pipe(delay(100), takeUntilDestroyed()).subscribe(() => {
    const value = this.formControl.value
    if (Array.isArray(value)) {
      this.formControl.setValue(
        value.map((item) => this.treeControl.dataNodes.find((node) => node.key === item.key) ?? item)
      )
    } else if (value) {
      this.formControl.setValue(
        this.treeControl.dataNodes.find((node) => node.key === value.key) ?? value
      )
    }
  })
  // Update tree dataSource data when select options and search text changed
  private _treeNodesSub = this.treeNodes$
    .pipe(
      combineLatestWith(
        this.autoControl.valueChanges.pipe(
          filter((value) => !value || typeof value === 'string'),
          startWith(null),
          distinctUntilChanged()
        )
      ),
      map(([treeNodes, text]) => {
        return filterTreeNodes(treeNodes ?? [], text, {
          considerKey: this.displayBehaviour !== DisplayBehaviour.descriptionOnly
        })
      }),
      takeUntilDestroyed()
    )
    .subscribe((nodes) => {
      this.dataSource.data = nodes
      if (this.initialLevel || !!this.autoControl.value) {
        this.treeControl.dataNodes.forEach((node) => {
          const level = this.treeControl.getLevel(node)
          // is in initial levels or the searched node is exacted
          if (level < this.initialLevel || (this.autoControl.value && node.childrenCardinality === 1)) {
            this.treeControl.expand(node)
          }
        })
      }
    })
  // Emit control value when select changed in select mode
  private _formControlSub = this.formControl.valueChanges
    .pipe(
      filter(() => !this.autocomplete() && !this.treeViewer()),
      distinctUntilChanged(isEqual),
      takeUntilDestroyed()
    )
    .subscribe((value) => {
      if (Array.isArray(value)) {
        this.allSelect = this.treeControl.dataNodes.length === value.length
        this.onChange?.(value.map((option) => option.key))
      } else {
        this.onChange?.(Array.isArray(value) ? value.map((option) => option.key) : value?.key)
      }
    })
  // Emit control value when single select changed in autocomplete and tree viewer modes
  private _singleSelectionSub = this.singleSelection.changed
    .pipe(
      filter(() => !this.multiple && (!!this.useAutocomplete || this.treeViewer())),
      takeUntilDestroyed()
    )
    .subscribe((event) => {
      this.onChange?.(this.singleSelection.selected?.[0])
    })
  // Emit control value when multiple select changed in autocomplete and tree viewer modes
  private multipleSelectionSub = this.multipleSelection.changed
    .pipe(
      filter(() => this.multiple && (!!this.useAutocomplete || this.treeViewer())),
      takeUntilDestroyed()
    )
    .subscribe((event) => {
      this.allSelect = this.treeControl.dataNodes.length === this.multipleSelection.selected.length
      this.onChange?.(this.multipleSelection.selected)
    })


  ngOnChanges({ displayDensity, validators }: SimpleChanges): void {
    if (displayDensity) {
      if (this.displayDensity === DisplayDensity.compact) {
        this.treeNodePaddingIndent = 10
        this.virtualScrollItemSize = 30
      } else if (this.displayDensity === DisplayDensity.cosy) {
        this.treeNodePaddingIndent = 15
        this.virtualScrollItemSize = 36
      } else {
        this.treeNodePaddingIndent = 20
        this.virtualScrollItemSize = 48
      }
    }
    
    if (validators) {
      this.formControl.setValidators(validators.currentValue)
    }
  }

  writeValue(obj: any): void {
    if (obj) {
      // Update autocomplete or treeViewer modes
      if (this.useAutocomplete || this.treeViewer()) {
        if (this.multiple) {
          this.multipleSelection.select(...obj)
        } else {
          this.singleSelection.select(...(Array.isArray(obj) ? obj : [obj]))
        }
      } else {
        // Update multiple or single model in select mode
        if (this.multiple) {
          this.formControl.setValue(
            obj.map((key) => this.treeControl.dataNodes.find((item) => item.key === key) ?? { key })
          )
        } else {
          obj = Array.isArray(obj) ? obj[0] : obj
          this.formControl.setValue(
            this.treeControl.dataNodes.find((item) => item.key === obj) ?? ({ key: obj } as FlatTreeNode<any>)
          )
        }
      }
    }
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    //
  }
  setDisabledState?(isDisabled: boolean): void {
    if (isDisabled) {
      this.formControl.disable()
      this.autoControl.disable()
    } else {
      this.formControl.enable()
      this.autoControl.enable()
    }
  }

  compareWith(a: FlatTreeNode<any>, b: FlatTreeNode<any>) {
    return a?.key === b?.key
  }

  displayWith(value: any) {
    return Array.isArray(value) ? value : value?.label || value?.value
  }

  trackByFun(index: number, item: any) {
    return item?.key
  }

  hasChild = (_: number, node: FlatTreeNode<T>) => node.expandable

  isSelected(option: FlatTreeNode<T>) {
    return this.multiple
      ? this.multipleSelection.isSelected(option?.key as string)
      : this.singleSelection.isSelected(option?.key)
  }

  toggleNode(node: FlatTreeNode<T>) {
    if (this.multiple) {
      this.multipleSelection.toggle(node.key)
    } else {
      this.singleSelection.toggle(node.key)
    }
  }

  onAutocompleteSelected(event: MatAutocompleteSelectedEvent): void {
    const key = event.option.value?.key
    if (this.multiple) {
      this.multipleSelection.select(key)
    } else {
      this.singleSelection.select(key)
    }
    this.autoInput.nativeElement.value = ''
    this.autoControl.setValue(null)
  }

  onCheckboxSelect(event: MatCheckboxChange, option: FlatTreeNode<any>) {
    if (this.multiple) {
      this.multipleSelection.toggle(option.key as string)
    } else {
      this.singleSelection.toggle(option.key as string)
    }
  }

  removeChip(event) {
    if (this.multiple) {
      this.multipleSelection.deselect(event.key)
    } else {
      this.singleSelection.deselect(event.key)
    }
  }

  clear(event) {
    event.stopPropagation()
    this.formControl.setValue(null)
    this.singleSelection.clear()
    this.multipleSelection.clear()
  }

  clearSearch(event) {
    event.stopPropagation()
    this.autoControl.setValue(null)
  }

  add(e) {
    //
  }

  someSelect(): boolean {
    return this.multipleSelection.hasValue() && !this.allSelect
  }

  setAll(selected: boolean) {
    this.allSelect = selected
    if (selected) {
      this.multipleSelection.select(...this.treeControl.dataNodes.map(({ key }) => key))
      this.formControl.setValue(this.treeControl.dataNodes.map((item) => ({ ...item })))
    } else {
      this.multipleSelection.clear()
      this.formControl.setValue([])
    }
  }

  onAutocompleteOpened() {
    this.cdkVirtualScrollViewPort?.checkViewportSize()
  }

  toggleExpand() {
    this.unfold = !this.unfold
    this.unfold ? this.treeControl.expandAll() : this.treeControl.collapseAll()
  }

  getErrorMessage() {
    return Object.values(this.formControl.errors).join(', ')
  }
}
