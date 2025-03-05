import { ThemePalette } from '@angular/material/core'
import { ControlOptions } from '@metad/ocap-angular/controls'
import { ParameterOptions } from '@metad/ocap-angular/parameter'
import {
  AggregationRole,
  Dimension,
  EntityType,
  FilterSelectionType,
  getEntityProperty,
  getPropertyHierarchy,
  isCalendarProperty,
  isDimension,
  isMeasureControlProperty,
  isParameterProperty,
  PresentationEnum,
  Semantics,
  TimeGranularity
} from '@metad/ocap-core'
import { FilterControlType } from '@metad/story/core'

export interface MeasureControlOptions {
  chipColor?: ThemePalette
}

/**
 *
 */
export interface InputControlOptions extends ControlOptions, MeasureControlOptions, ParameterOptions {
  selectionType: FilterSelectionType
  label: string
  placeholder: string
  useHierarchy: boolean
  maxTagCount: number
  presentation: PresentationEnum
  controlType: FilterControlType
  cascadingEffect: boolean

  // for Calendar
  granularity?: TimeGranularity
  granularitySequence?: number
  formatter?: string
  defaultValue?: string
  dates?: string[]

  // for Chips
  ariaOrientation?: 'horizontal' | 'vertical'
  hideSingleSelectionIndicator?: boolean
  highlighted?: boolean
}

export function determineControlType(propertyName: Dimension, entityType: EntityType, controlType?: FilterControlType) {
  const property = getEntityProperty(entityType, propertyName)
  if (!property) {
    return null
  }

  // 1. Measure control
  if (isMeasureControlProperty(property)) {
    return FilterControlType.MeasureControl
  }

  // 2. User Input Parameter
  if (isParameterProperty(property)) {
    return FilterControlType.Parameter
  }

  // if (isParameterControlProperty(property)) {
  //   this.inputControl.setValue(property.value)
  //   return FilterControlType.Input
  // }

  // 3. Date picker
  if (isCalendarProperty(property)) {
    return controlType ?? FilterControlType.Datepicker
  }

  if (isDimension(propertyName)) {
    const hierarchy = property?.hierarchies?.find((item) => item.name === getPropertyHierarchy(propertyName))
    const levelProperty = hierarchy?.levels?.find((level) => level.name === propertyName.level)

    if (levelProperty?.semantics?.semantic && Semantics[levelProperty.semantics.semantic].startsWith('Calendar')) {
      return controlType ?? FilterControlType.Datepicker
    }
  }

  if (property.role === AggregationRole.variable) {
    return FilterControlType.Variable
  }

  // if (presentation === PresentationEnum.Flat) {
  //   return FilterControlType.Select
  // }
  // if (presentation === PresentationEnum.Hierarchy) {
  //   return FilterControlType.TreeSelect
  // }

  if (property?.hierarchies?.length > 0) {
    return controlType ?? FilterControlType.TreeSelect
  }

  return controlType ?? FilterControlType.Select
}

// ParamterType
// {
//   "catalogName": "ZCPMM0125",
//   "schemaName": null,
//   "cubeName": "ZCPMM0125/ZCPMM0125_Q001",
//   "variableName": "[!V000002]",
//   "variableCaption": "日历日",
//   "variableGuid": "005056AA-33EA-1EEB-A786-2A6C3133231B",
//   "variableOrdinal": 2,
//   "variableType": 1,
//   "dataType": "CHAR",
//   "maxLength": 143,
//   "variableProcessingType": 1,
//   "variableSelectionType": 3,
//   "variableEntryType": 0,
//   "referenceDimension": "[ZCALDAY]",
//   "referenceHierarchy": "[ZCALDAY]",
//   "defaultLow": null,
//   "defaultHigh": null,
//   "defaultLowCaption": null,
//   "defaultHighCaption": null,
//   "description": "日历日",
//   "name": "[!V000002]",
//   "caption": "日历日",
//   "label": "日历日",
//   "dimension": "[ZCALDAY]",
//   "hierarchy": "[ZCALDAY]"
// }
