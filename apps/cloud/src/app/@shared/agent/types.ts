import { computed, Directive, model } from '@angular/core'
import { FILE_VARIABLES, TInterruptMessage, TStateVariable, TWorkflowVarGroup, XpertParameterTypeEnum } from '@cloud/app/@core/types'

export type TStateVariableType = TStateVariable & {
  expanded?: boolean
  parent?: string
  level?: number
  displayName: string
}

@Directive()
export class AbstractInterruptComponent<T = unknown, O = unknown> {
  // Inputs
  readonly projectId = model<string>()
  readonly conversationId = model<string>()
  readonly message = model<TInterruptMessage<T>>()

  // Outputs
  readonly value = model<O>()

  // States
  readonly data = computed(() => this.message()?.data)
}

export function expandVariablesWithItems(groups: TWorkflowVarGroup[]) {
  if (!groups?.length) {
    return groups
  }
  let changed = false
  const nextGroups = groups.map((group) => {
    const variables = group.variables as TStateVariableType[]
    if (!variables?.length) {
      return group
    }
    const seen = new Set(variables.map((item) => item.name))
    let groupChanged = false
    const nextVariables: TStateVariableType[] = []
    for (const variable of variables) {
      nextVariables.push(variable)
      const childVariables = buildItemVariables(variable, seen)
      if (childVariables.length) {
        nextVariables.push(...childVariables)
        groupChanged = true
      }
    }
    const levelResult = applyVariableLevels(nextVariables)
    if (!groupChanged && !levelResult.changed) {
      return group
    }
    changed = true
    return {
      ...group,
      variables: levelResult.variables
    }
  })
  return changed ? nextGroups : groups
}

function applyVariableLevels(variables: TStateVariableType[]) {
  const variablesByName = new Map<string, TStateVariableType>()
  for (const variable of variables) {
    variablesByName.set(variable.name, variable)
  }

  let changed = false
  const nextVariables = variables.map((variable) => {
    const level = resolveVariableLevel(variable, variablesByName)
    if (variable.level === level) {
      return variable
    }
    changed = true
    return {
      ...variable,
      level
    }
  })

  return { variables: nextVariables, changed }
}

function resolveVariableLevel(variable: TStateVariableType, variablesByName: Map<string, TStateVariableType>) {
  if (!variable.parent) {
    return 0
  }
  let level = 0
  let currentName: string | undefined = variable.parent
  let guard = 0
  while (currentName && guard < 50) {
    const parent = variablesByName.get(currentName)
    if (!parent) {
      break
    }
    level += 1
    currentName = parent.parent
    guard += 1
  }
  return level
}

function buildItemVariables(variable: TStateVariableType, seen: Set<string>): TStateVariableType[] {
  if (!hasItemChildren(variable)) {
    return []
  }
  const children: TStateVariableType[] = []
  if (variable.type === XpertParameterTypeEnum.FILE) {
    for (const fileVar of FILE_VARIABLES) {
      const name = `${variable.name}.${fileVar.name}`
      if (seen.has(name)) {
        continue
      }
      const child: TStateVariableType = {
        ...(fileVar as TStateVariable),
        name,
        displayName: fileVar.name,
        parent: variable.name
      }
      children.push(child)
      seen.add(name)
    }
  }
  for (const item of variable.item ?? []) {
    if (!item?.name) {
      continue
    }
    const name = `${variable.name}.${item.name}`
    if (seen.has(name)) {
      continue
    }
    const child: TStateVariableType = {
      ...(item as TStateVariable),
      name,
      displayName: item.name,
      parent: variable.name
    }
    children.push(child)
    seen.add(name)
    const nested = buildItemVariables(child, seen)
    if (nested.length) {
      children.push(...nested)
    }
  }
  return children
}

function hasItemChildren(variable: TStateVariableType) {
  return Array.isArray(variable.item) && variable.item.length > 0 || variable.type === XpertParameterTypeEnum.FILE
}
