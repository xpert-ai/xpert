import { ChangeDetectorRef, Component, HostBinding, Inject, Input, OnInit, Optional, ViewChild, ViewContainerRef } from '@angular/core'
import { Z_MODAL_DATA, ZardDialogRef, ZardDialogService } from '@xpert-ai/headless-ui'
import {
  Dimension,
  DisplayBehaviour,
  EntityType,
  FilteringLogic,
  FILTER_OPERATOR_DESC,
  getEntityDimensions,
  getEntityProperty,
  IAdvancedFilter,
  isAdvancedFilter,
  FilterOperator,
  IFilter,
  Property,
  Syntax,
  EntitySet,
  DataSettings,
  isNil,
} from '@metad/ocap-core'
import { NgmValueHelpComponent } from '@metad/ocap-angular/controls'
import { firstValueFrom } from 'rxjs'
import { NgmPropertySelectComponent, PropertyCapacity } from '@metad/ocap-angular/entity'
import { ISelectOption, KEYS } from '@metad/ocap-angular/core'

/**
 * @hidden
 */
class ExpressionItem {
  constructor(parent?: ExpressionGroupItem) {
    this.parent = parent
  }
  parent: ExpressionGroupItem
  selected: boolean
}

/**
 * @hidden
 */
class ExpressionGroupItem extends ExpressionItem {
  constructor(operator: FilteringLogic, parent?: ExpressionGroupItem) {
    super(parent)
    this.operator = operator
    this.children = []
  }
  operator: FilteringLogic
  children: ExpressionItem[]
}

/**
 * @hidden
 */
class ExpressionOperandItem extends ExpressionItem {
  constructor(expression: IFilter, parent: ExpressionGroupItem) {
    super(parent)
    this.expression = expression
  }
  expression: IFilter
  inEditMode: boolean
  inAddMode: boolean
  hovered: boolean
  columnHeader: string
}

@Component({
  selector: 'ngm-advanced-filter',
  templateUrl: './advanced-filter.component.html',
  styleUrls: ['./advanced-filter.component.scss'],
  standalone: false,
  host: {
    class: 'ngm-advanced-filter'
  },
})
export class NgmAdvancedFilterComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true
  PropertyCapacity = PropertyCapacity
  /**
   * @hidden @internal
   */
  DISPLAY_BEHAVIOUR = DisplayBehaviour
  FilterOperator = FilterOperator

  @Input() syntax: Syntax
  @Input() entitySet: EntitySet
  @Input() entityType: EntityType

  @Input() resourceStrings

  /**
   * @hidden @internal
   */
  public rootGroup: ExpressionGroupItem

  /**
   * @hidden @internal
   */
  public selectedExpressions: ExpressionOperandItem[] = []

  /**
   * @hidden @internal
   */
  public selectedGroups: ExpressionGroupItem[] = []

  /**
   * @hidden @internal
   */
  public currentGroup: ExpressionGroupItem

  /**
   * @hidden @internal
   */
  public editedExpression: ExpressionOperandItem

  /**
   * @hidden @internal
   */
  public addModeExpression: ExpressionOperandItem

  /**
   * @hidden @internal
   */
  public contextualGroup: ExpressionGroupItem

  /**
   * @hidden @internal
   */
  public filteringLogics

  public operators: Array<ISelectOption>

  /**
   * @hidden @internal
   */
  public selectedCondition: FilterOperator

  /**
   * @hidden @internal
   */
  public searchValue: any
  public highValue: any

  /**
   * @hidden @internal
   */
  @ViewChild('columnSelect', { read: NgmPropertySelectComponent })
  public columnSelect: NgmPropertySelectComponent;

  // /**
  //  * @hidden @internal
  //  */
  // @ViewChild(IgxToggleDirective)
  // public contextMenuToggle: IgxToggleDirective

  // private _selectedColumn: Property
  private _selectedDimension: Dimension
  private _clickTimer
  private _dblClickDelay = 200
  private _preventChipClick = false
  constructor(
    public cdr: ChangeDetectorRef,
    public dialog: ZardDialogService,
    private readonly _viewContainerRef: ViewContainerRef,
    @Optional()
    @Inject(Z_MODAL_DATA) public data?: {
      dataSettings: DataSettings,
      entityType: EntityType,
      syntax: Syntax,
      advancedFilter: IAdvancedFilter
    },
    @Optional()
    public dialogRef?: ZardDialogRef<NgmAdvancedFilterComponent>,
  ) {}

  ngOnInit(): void {
    this.entityType = this.data.entityType
    this.syntax = this.data.syntax

    if (this.data?.advancedFilter) {
      this.rootGroup = convertFilter2ExpressionItem(this.data.advancedFilter, null) as ExpressionGroupItem
      this.currentGroup = this.rootGroup
    }

    if (this.syntax === Syntax.MDX) {
      this.operators = getMDXOperators()
    } else {
      this.operators = getAllOperators()
    }
  }

  /**
   * @hidden @internal
   */
  public get selectedDimension(): Dimension {
    return this._selectedDimension
  }

  /**
   * @hidden @internal
   */
  public set selectedDimension(value: Dimension) {
    this._selectedDimension = value
  }

  /**
   * @hidden @internal
   */
  get filterableColumns(): Property[] {
    return getEntityDimensions(this.entityType)
  }

  /**
   * @hidden @internal
   */
  public getEntityProperty(name) {
    return getEntityProperty(this.entityType, name)
  }

  /**
   * @hidden @internal
   */
  public addCondition(parent: ExpressionGroupItem, afterExpression?: ExpressionItem) {
    this.cancelOperandAdd()

    const operandItem = new ExpressionOperandItem(
      {
        dimension: null,
        operator: null,
        and: true,
        members: null,
      },
      parent
    )

    if (afterExpression) {
      const index = parent.children.indexOf(afterExpression)
      parent.children.splice(index + 1, 0, operandItem)
    } else {
      parent.children.push(operandItem)
    }

    this.enterExpressionEdit(operandItem)
  }

  /**
   * @hidden @internal
   */
  public addAndGroup(parent?: ExpressionGroupItem, afterExpression?: ExpressionItem) {
    this.addGroup(FilteringLogic.And, parent, afterExpression)
  }

  /**
   * @hidden @internal
   */
  public addOrGroup(parent?: ExpressionGroupItem, afterExpression?: ExpressionItem) {
    this.addGroup(FilteringLogic.Or, parent, afterExpression)
  }

  /**
   * @hidden @internal
   */
  public endGroup(groupItem: ExpressionGroupItem) {
    this.currentGroup = groupItem.parent
  }

  /**
   * @hidden @internal
   */
  public commitOperandEdit() {
    if (this.editedExpression) {
      // this.editedExpression.expression.path = this.selectedColumn.name
      this.editedExpression.expression.dimension = this.selectedDimension
      this.editedExpression.expression.operator = this.selectedCondition
      //this.selectedColumn.filters.condition(
      //   this.selectedCondition
      // )
      // this.editedExpression.expression.members = this.searchValue
      this.editedExpression.expression.members = [{
        key: this.searchValue,
        value: this.searchValue,
      }]
      if (this.editedExpression.expression.operator === FilterOperator.BT && !isNil(this.highValue)) {
        this.editedExpression.expression.members.push({
          key: this.highValue,
          value: this.highValue
        })
      }
      // DataUtil.parseValue(
      //   this.selectedColumn.dataType,
      //   this.searchValue
      // )
      // this.editedExpression.columnHeader = this.selectedColumn.label

      this.editedExpression.inEditMode = false
      this.editedExpression = null
    }
  }

  /**
   * @hidden @internal
   */
  public cancelOperandAdd() {
    if (this.addModeExpression) {
      this.addModeExpression.inAddMode = false
      this.addModeExpression = null
    }
  }

  /**
   * @hidden @internal
   */
  public cancelOperandEdit() {
    if (this.editedExpression) {
      this.editedExpression.inEditMode = false

      if (!this.editedExpression.expression.dimension) {
          this.deleteItem(this.editedExpression);
      }

      this.editedExpression = null
    }
  }

  /**
   * @hidden @internal
   */
  public operandCanBeCommitted(): boolean {
    return this.selectedDimension && this.selectedCondition && !!this.searchValue //|| this.selectedColumn.filters.condition(this.selectedCondition).isUnary);
  }

  /**
   * @hidden @internal
   */
  public exitOperandEdit() {
    if (!this.editedExpression) {
      return
    }

    if (this.operandCanBeCommitted()) {
      this.commitOperandEdit()
    } else {
      this.cancelOperandEdit()
    }
  }

  /**
   * @hidden @internal
   */
  public isExpressionGroup(expression: ExpressionItem): boolean {
    return expression instanceof ExpressionGroupItem
  }

  private addGroup(
    operator: FilteringLogic,
    parent?: ExpressionGroupItem,
    afterExpression?: ExpressionItem
  ) {
    this.cancelOperandAdd()

    const groupItem = new ExpressionGroupItem(operator, parent)

    if (parent) {
      if (afterExpression) {
        const index = parent.children.indexOf(afterExpression)
        parent.children.splice(index + 1, 0, groupItem)
      } else {
        parent.children.push(groupItem)
      }
    } else {
      this.rootGroup = groupItem
    }

    this.addCondition(groupItem)
    this.currentGroup = groupItem
  }

  /**
   * @hidden @internal
   */
  public enterExpressionEdit(expressionItem: ExpressionOperandItem) {
    this.clearSelection();
    this.exitOperandEdit()
    this.cancelOperandAdd()
    if (this.editedExpression) {
      this.editedExpression.inEditMode = false
    }
    expressionItem.hovered = false
    this.selectedDimension = expressionItem.expression.dimension
    // console.warn(expressionItem)
    this.selectedCondition = expressionItem.expression.operator
      ? expressionItem.expression.operator
      : null
    this.searchValue = expressionItem.expression.members?.[0]?.value
    this.highValue = expressionItem.expression.members?.[1]?.value
    expressionItem.inEditMode = true
    this.editedExpression = expressionItem
    this.cdr.detectChanges()
    // this.columnSelectOverlaySettings.target = this.columnSelect.element;
    // this.columnSelectOverlaySettings.excludeFromOutsideClick = [this.columnSelect.element as HTMLElement];
    // this.columnSelectOverlaySettings.positionStrategy = new AutoPositionStrategy();
    // this.conditionSelectOverlaySettings.target = this.conditionSelect.element;
    // this.conditionSelectOverlaySettings.excludeFromOutsideClick = [this.conditionSelect.element as HTMLElement];
    // this.conditionSelectOverlaySettings.positionStrategy = new AutoPositionStrategy();
    if (!this.selectedDimension) {
        this.columnSelect.focus();
    }
    // else if (this.selectedColumn.filters.condition(this.selectedCondition).isUnary) {
    //     this.conditionSelect.input.nativeElement.focus();
    // } else {
    //     this.searchValueInput.nativeElement.focus();
    // }
  }

  getPropertyByName(path) {
    return this.filterableColumns.find(item => item.name === path)
  }

  /**
   * @hidden @internal
   */
  public clearSelection() {
    for (const group of this.selectedGroups) {
      group.selected = false
    }
    this.selectedGroups = []

    for (const expr of this.selectedExpressions) {
      expr.selected = false
    }
    this.selectedExpressions = []

    this.toggleContextMenu()
  }

  /**
   * @hidden @internal
   */
  public enterExpressionAdd(expressionItem: ExpressionOperandItem) {
    this.clearSelection()
    this.exitOperandEdit()

    if (this.addModeExpression) {
      this.addModeExpression.inAddMode = false
    }

    expressionItem.inAddMode = true
    this.addModeExpression = expressionItem
    if (expressionItem.selected) {
      this.toggleExpression(expressionItem)
    }
  }

  private onToggleExpression(expressionItem: ExpressionOperandItem) {
    this.exitOperandEdit()
    this.toggleExpression(expressionItem)

    // this.toggleContextMenu();
  }

  private toggleExpression(expressionItem: ExpressionOperandItem) {
    expressionItem.selected = !expressionItem.selected

    if (expressionItem.selected) {
      this.selectedExpressions.push(expressionItem)
    } else {
      const index = this.selectedExpressions.indexOf(expressionItem)
      this.selectedExpressions.splice(index, 1)
      this.deselectParentRecursive(expressionItem)
    }
  }

  private toggleContextMenu() {
    const contextualGroup = this.findSingleSelectedGroup()

    if (contextualGroup || this.selectedExpressions.length > 1) {
      this.contextualGroup = contextualGroup

      if (contextualGroup) {
        this.filteringLogics = [
          {
            label: this.resourceStrings?.igx_grid_filter_operator_and,
            selected: contextualGroup.operator === FilteringLogic.And,
          },
          {
            label: this.resourceStrings?.igx_grid_filter_operator_or,
            selected: contextualGroup.operator === FilteringLogic.Or,
          },
        ]
      }
    }
    // else if (this.contextMenuToggle) {
    //   this.contextMenuToggle.close()
    // }
  }

  private findSingleSelectedGroup(): ExpressionGroupItem {
    for (const group of this.selectedGroups) {
      const containsAllSelectedExpressions = this.selectedExpressions.every((op) =>
        this.isInsideGroup(op, group)
      )

      if (containsAllSelectedExpressions) {
        return group
      }
    }

    return null
  }

  private isInsideGroup(item: ExpressionItem, group: ExpressionGroupItem): boolean {
    if (!item) {
      return false
    }

    if (item.parent === group) {
      return true
    }

    return this.isInsideGroup(item.parent, group)
  }

  private deleteItem(expressionItem: ExpressionItem) {
    if (!expressionItem.parent) {
      this.rootGroup = null
      this.currentGroup = null
      return
    }

    if (expressionItem === this.currentGroup) {
      this.currentGroup = this.currentGroup.parent
    }

    const children = expressionItem.parent.children
    const index = children.indexOf(expressionItem)
    children.splice(index, 1)

    if (!children.length) {
      this.deleteItem(expressionItem.parent)
    }
  }

  /**
   * @hidden @internal
   */
  public onChipRemove(expressionItem: ExpressionItem) {
    this.deleteItem(expressionItem)
  }

  /**
   * @hidden @internal
   */
  public onChipClick(expressionItem: ExpressionOperandItem) {
    this._clickTimer = setTimeout(() => {
      if (!this._preventChipClick) {
        this.onToggleExpression(expressionItem)
      }
      this._preventChipClick = false
    }, this._dblClickDelay)
  }

  /**
   * @hidden @internal
   */
  public onChipDblClick(expressionItem: ExpressionOperandItem) {
    clearTimeout(this._clickTimer)
    this._preventChipClick = true
    this.enterExpressionEdit(expressionItem)
  }

  /**
   * @hidden @internal
   */
  public getConditionFriendlyName(name: string): string {
    return this.resourceStrings?.[`igx_grid_filter_${name}`] || name
  }

  /**
   * @hidden @internal
   */
  public getConditionList(): string[] {
    return this.selectedDimension ? getFilterConditionByProperty(this.selectedDimension) : []
  }

  /**
   * @hidden @internal
   */
  public onGroupClick(groupItem: ExpressionGroupItem) {
    this.toggleGroup(groupItem)
  }

  private toggleGroup(groupItem: ExpressionGroupItem) {
    this.exitOperandEdit()
    // if (groupItem.children && groupItem.children.length) {
    //     this.toggleGroupRecursive(groupItem, !groupItem.selected);
    //     if (!groupItem.selected) {
    //         this.deselectParentRecursive(groupItem);
    //     }
    //     this.toggleContextMenu();
    // }
    this.currentGroup = groupItem
  }

  private toggleGroupRecursive(groupItem: ExpressionGroupItem, selected: boolean) {
    // if (groupItem.selected !== selected) {
    //     groupItem.selected = selected;
    //     if (groupItem.selected) {
    //         this.selectedGroups.push(groupItem);
    //     } else {
    //         const index = this.selectedGroups.indexOf(groupItem);
    //         this.selectedGroups.splice(index, 1);
    //     }
    // }
    // for (const expr of groupItem.children) {
    //     if (expr instanceof ExpressionGroupItem) {
    //         this.toggleGroupRecursive(expr, selected);
    //     } else {
    //         const operandExpression = expr as ExpressionOperandItem;
    //         if (operandExpression.selected !== selected) {
    //             this.toggleExpression(operandExpression);
    //         }
    //     }
    // }
  }

  private deselectParentRecursive(expressionItem: ExpressionItem) {
    // const parent = expressionItem.parent;
    // if (parent) {
    //     if (parent.selected) {
    //         parent.selected = false;
    //         const index = this.selectedGroups.indexOf(parent);
    //         this.selectedGroups.splice(index, 1);
    //     }
    //     this.deselectParentRecursive(parent);
    // }
  }

  /**
   * @hidden @internal
   */
  public invokeClick(eventArgs: KeyboardEvent) {
    if (
      eventArgs.key === KEYS.ENTER ||
      eventArgs.key === KEYS.SPACE ||
      eventArgs.key === KEYS.SPACE_IE
    ) {
      eventArgs.preventDefault()
      ;(eventArgs.currentTarget as HTMLElement).click()
    }
  }

  /**
   * @hidden @internal
   */
  public context(expression: ExpressionItem, afterExpression?: ExpressionItem) {
    return {
      $implicit: expression,
      afterExpression,
    }
  }

  /**
     * @hidden @internal
     */
  public onClearButtonClick(event?: Event) {
    this.rootGroup = null
  }

  /**
   * @hidden @internal
   */
  public onChipSelectionEnd() {
    const contextualGroup = this.findSingleSelectedGroup()
    if (contextualGroup || this.selectedExpressions.length > 1) {
      this.contextualGroup = contextualGroup
      // this.calculateContextMenuTarget()
      // if (this.contextMenuToggle.collapsed) {
      //   this.contextMenuToggle.open(this._overlaySettings)
      // } else {
      //   this.contextMenuToggle.reposition()
      // }
    }
  }

  public getConditionByFilterOperator(operator: string) {
    return {
      iconName: 'contains',
      isUnary: true
    }
  }

  async openValueHelp(dimension: Dimension) {
    return firstValueFrom(this.dialog.open(NgmValueHelpComponent, {
      viewContainerRef: this._viewContainerRef,
      data: {
        dataSettings: this.data.dataSettings,
        dimension: dimension,
        options: {
          initialLevel: 1,
          searchable: true,
          showAllMember: false
        }
      }
    }).afterClosed())
  }

  async openLowValueHelp(dimension: Dimension) {
    const slicer = await this.openValueHelp(dimension)
    if (slicer) {
      this.searchValue = slicer.members?.[0]?.value
    }
  }
  
  async openHighValueHelp(dimension: Dimension) {
    const slicer = await this.openValueHelp(dimension)
    if (slicer) {
      this.highValue = slicer.members?.[0]?.value
    }
  }

  onApply() {
    this.dialogRef.close(convertExpressionItem2Filter(this.rootGroup))
  }
  
  /**
   * @hidden @internal
   */
  isDate(value) {
    return Object.prototype.toString.call(value) === "[object Date]"
  }
}

function getMDXOperators() {
  return [FilterOperator.EQ, FilterOperator.NE].map(o => ({
    value: o,
    label: FILTER_OPERATOR_DESC[o]
  }))
}

function getAllOperators() {
  return [
    FilterOperator.EQ,
    FilterOperator.NE,
    FilterOperator.BT,
    FilterOperator.GT,
    FilterOperator.GE,
    FilterOperator.LT,
    FilterOperator.LE,
  ]
  .map(o => ({
    value: o,
    label: FILTER_OPERATOR_DESC[o]
  }))
}

export function getFilterConditionByProperty(dim: Dimension) {
  return Object.keys(FilterOperator)
}

export function convertExpressionItem2Filter(item: ExpressionItem): IFilter {
  if (item instanceof ExpressionGroupItem) {
    return {
      filteringLogic: item.operator,
      children: item.children.map(item => convertExpressionItem2Filter(item))
    } as IAdvancedFilter
  }

  if (item instanceof ExpressionOperandItem) {
    return item.expression
  }
  
  return null
}

export function convertFilter2ExpressionItem(iFilter: IFilter, parent: ExpressionGroupItem): ExpressionItem {
  if (isAdvancedFilter(iFilter)) {
    const exGroupItem = new ExpressionGroupItem(iFilter.filteringLogic, parent)

    exGroupItem.children = iFilter.children.map(item => convertFilter2ExpressionItem(item, exGroupItem))

    return exGroupItem
  }

  return new ExpressionOperandItem(iFilter, parent)
}
