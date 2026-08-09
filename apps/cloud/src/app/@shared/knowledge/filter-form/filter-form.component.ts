import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { XpI18nPipe, ZardButtonComponent, ZardInputDirective, ZardSelectImports } from '@xpert-ai/headless-ui'
import {
  KBMetadataFieldDef,
  KnowledgeFilterNode,
  KnowledgeFilterOperator,
  KnowledgeFilterValue,
  MetadataFieldType
} from 'apps/cloud/src/app/@core'

type MutableFilterGroup = {
  kind: 'group'
  operator: 'and' | 'or'
  children: KnowledgeFilterNode[]
}

const STRING_OPERATORS: KnowledgeFilterOperator[] = [
  'eq',
  'neq',
  'in',
  'notIn',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'exists'
]
const NUMBER_OPERATORS: KnowledgeFilterOperator[] = ['eq', 'neq', 'in', 'gt', 'gte', 'lt', 'lte', 'between', 'exists']

@Component({
  selector: 'xp-knowledge-filter-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports
  ],
  templateUrl: './filter-form.component.html'
})
export class XpertKnowledgeFilterFormComponent {
  readonly filter = model<KnowledgeFilterNode>()
  readonly fields = input<KBMetadataFieldDef[]>([])
  readonly allowVariables = input(true)
  readonly folderOptions = input<Array<{ label: string; value: string }>>([])
  readonly rootFolderValue = '__xpert_knowledge_root_folder__'

  readonly root = computed<MutableFilterGroup>(() => {
    const current = this.filter()
    if (current?.kind === 'group') return current as MutableFilterGroup
    return {
      kind: 'group',
      operator: 'and',
      children: current ? [current] : []
    }
  })

  childPath(path: number[], index: number) {
    return [...path, index]
  }

  asGroup(node: KnowledgeFilterNode) {
    return node as MutableFilterGroup
  }

  asCondition(node: KnowledgeFilterNode) {
    return node.kind === 'condition' ? node : null
  }

  field(fieldName: string) {
    return this.fields().find((item) => item.key === fieldName)
  }

  operators(fieldName: string): KnowledgeFilterOperator[] {
    const field = this.field(fieldName)
    if (fieldName === 'document.folderPath') return [...STRING_OPERATORS, 'under']
    switch (field?.type) {
      case 'number':
      case 'datetime':
        return NUMBER_OPERATORS
      case 'boolean':
        return ['eq', 'neq', 'exists']
      case 'string[]':
      case 'number[]':
        return ['contains', 'containsAny', 'containsAll', 'isEmpty', 'exists']
      case 'object':
        return ['jsonContains', 'exists']
      case 'enum':
        return ['eq', 'neq', 'in', 'notIn', 'exists']
      default:
        return STRING_OPERATORS
    }
  }

  requiresValue(operator: KnowledgeFilterOperator) {
    return !['exists', 'isEmpty'].includes(operator)
  }

  valueKind(node: KnowledgeFilterNode) {
    return this.asCondition(node)?.value?.kind ?? 'literal'
  }

  displayValue(node: KnowledgeFilterNode) {
    const value = this.asCondition(node)?.value
    if (!value) return ''
    if (value.kind === 'variable') return value.selector
    return typeof value.value === 'string' ? value.value : JSON.stringify(value.value)
  }

  setGroupOperator(path: number[], selection: unknown) {
    const operator = this.selectionValue(selection)
    if (operator !== 'and' && operator !== 'or') return
    this.update((root) => {
      this.groupAt(root, path).operator = operator
    })
  }

  addCondition(path: number[], fieldName: string) {
    if (!fieldName) return
    const operator = this.operators(fieldName)[0]
    this.update((root) => {
      this.groupAt(root, path).children.push({
        kind: 'condition',
        field: fieldName,
        operator,
        value: { kind: 'literal', value: this.defaultValue(this.field(fieldName)?.type, operator) }
      })
    })
  }

  addGroup(path: number[]) {
    const field = this.fields()[0]
    if (!field) return
    const operator = this.operators(field.key)[0]
    this.update((root) => {
      this.groupAt(root, path).children.push({
        kind: 'group',
        operator: 'and',
        children: [
          {
            kind: 'condition',
            field: field.key,
            operator,
            value: { kind: 'literal', value: this.defaultValue(field.type, operator) }
          }
        ]
      } as KnowledgeFilterNode)
    })
  }

  remove(path: number[], index: number) {
    this.update((root) => this.groupAt(root, path).children.splice(index, 1))
  }

  setField(path: number[], selection: unknown) {
    const fieldName = this.selectionValue(selection)
    if (!this.field(fieldName)) return
    this.updateCondition(path, (condition) => {
      condition.field = fieldName
      condition.operator = this.operators(fieldName)[0]
      condition.value = {
        kind: 'literal',
        value: this.defaultValue(this.field(fieldName)?.type, condition.operator)
      }
    })
  }

  setOperator(path: number[], selection: unknown) {
    const operator = this.selectionValue(selection) as KnowledgeFilterOperator
    this.updateCondition(path, (condition) => {
      if (!this.operators(condition.field).includes(operator)) return
      condition.operator = operator
      condition.value = this.requiresValue(operator)
        ? condition.value?.kind === 'variable'
          ? condition.value
          : { kind: 'literal', value: this.defaultValue(this.field(condition.field)?.type, operator) }
        : undefined
    })
  }

  setValueKind(path: number[], selection: unknown) {
    const kind = this.selectionValue(selection) as KnowledgeFilterValue['kind']
    if (kind !== 'literal' && kind !== 'variable') return
    this.updateCondition(path, (condition) => {
      condition.value =
        kind === 'variable'
          ? { kind: 'variable', selector: '' }
          : {
              kind: 'literal',
              value: this.defaultValue(this.field(condition.field)?.type, condition.operator)
            }
    })
  }

  setValue(path: number[], rawValue: string) {
    this.updateCondition(path, (condition) => {
      condition.value =
        condition.value?.kind === 'variable'
          ? { kind: 'variable', selector: rawValue }
          : {
              kind: 'literal',
              value: this.parseLiteral(rawValue, this.field(condition.field)?.type, condition.operator)
            }
    })
  }

  folderSelectionValue(node: KnowledgeFilterNode) {
    return this.displayValue(node) || this.rootFolderValue
  }

  setFolderValue(path: number[], selection: unknown) {
    const value = this.selectionValue(selection)
    this.setValue(path, value === this.rootFolderValue ? '' : value)
  }

  hasFolderOption(value: string) {
    return this.folderOptions().some((folder) => folder.value === value)
  }

  private update(mutator: (root: MutableFilterGroup) => void) {
    const root = structuredClone(this.root()) as MutableFilterGroup
    mutator(root)
    pruneEmptyGroups(root)
    this.filter.set(root.children.length ? (root as KnowledgeFilterNode) : undefined)
  }

  private groupAt(root: MutableFilterGroup, path: number[]) {
    return path.reduce((group, index) => group.children[index] as MutableFilterGroup, root)
  }

  private updateCondition(
    path: number[],
    mutator: (condition: Extract<KnowledgeFilterNode, { kind: 'condition' }>) => void
  ) {
    this.update((root) => {
      const parent = this.groupAt(root, path.slice(0, -1))
      const condition = parent.children[path[path.length - 1]]
      if (condition?.kind === 'condition') mutator(condition)
    })
  }

  private defaultValue(type?: MetadataFieldType, operator?: KnowledgeFilterOperator) {
    if (operator === 'in' || operator === 'notIn' || operator === 'between') return []
    if (operator === 'containsAny' || operator === 'containsAll') return []
    if (type === 'number') return 0
    if (type === 'boolean') return false
    if (type === 'number[]' && operator === 'contains') return 0
    if (type === 'string[]' && operator === 'contains') return ''
    if (type === 'object') return {}
    return ''
  }

  private parseLiteral(rawValue: string, type?: MetadataFieldType, operator?: KnowledgeFilterOperator) {
    if (type === 'boolean') return rawValue === 'true'
    if (type === 'number[]' && operator === 'contains') return Number(rawValue)
    if (type === 'number' && !['in', 'notIn', 'between'].includes(operator)) return Number(rawValue)
    if (
      ['in', 'notIn', 'between', 'containsAny', 'containsAll', 'jsonContains'].includes(operator) ||
      type === 'object'
    ) {
      try {
        return JSON.parse(rawValue)
      } catch {
        return rawValue
      }
    }
    return rawValue
  }

  private selectionValue(selection: unknown) {
    const value = Array.isArray(selection) ? selection[0] : selection
    return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
  }
}

function pruneEmptyGroups(group: MutableFilterGroup) {
  group.children = group.children.filter((child) => {
    if (child.kind !== 'group') return true
    pruneEmptyGroups(child as MutableFilterGroup)
    return child.children.length > 0
  })
}
