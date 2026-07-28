/**
 * UI-only display modes retained for compatibility with the legacy controls.
 *
 * Keep the serialized values stable because existing forms and persisted
 * configuration use these strings directly.
 *
 * @deprecated Legacy UI compatibility type. New components should define a
 * domain-specific display mode instead.
 */
export enum DisplayBehaviour {
  descriptionAndId = 'descriptionAndId',
  descriptionOnly = 'descriptionOnly',
  idAndDescription = 'idAndDescription',
  idOnly = 'idOnly',
  auto = ''
}

/**
 * @deprecated Legacy UI compatibility type. New components should use their
 * domain-specific time granularity contract.
 */
export enum TimeGranularity {
  Year = 'Year',
  Quarter = 'Quarter',
  Month = 'Month',
  Week = 'Week',
  Day = 'Day'
}

/**
 * @deprecated Legacy UI compatibility type. New components should use their
 * domain-specific time-range contract.
 */
export enum TimeRangeType {
  Standard = 'Standard',
  Offset = 'Offset'
}

/**
 * @deprecated Legacy UI compatibility type. New components should use their
 * domain-specific offset direction contract.
 */
export enum OffSetDirection {
  LookBack = 'LookBack',
  LookAhead = 'LookAhead'
}

/**
 * @deprecated Legacy UI compatibility type. New components should use their
 * domain-specific time-offset contract.
 */
export interface TimeOffSet {
  current?: Date
  direction: OffSetDirection
  granularity: TimeGranularity
  amount: number
}

/**
 * @deprecated Legacy UI compatibility type. New components should use their
 * domain-specific time-range contract.
 */
export interface TimeRange {
  type: TimeRangeType
  granularity: TimeGranularity
  current?: TimeOffSet
  lookBack?: number
  lookAhead?: number
  start?: string
  end?: string
  selected?: boolean
  formatter?: string
}

/**
 * Minimal property shape required by the compatibility table.
 *
 * This is intentionally a UI contract rather than an OCAP semantic-model
 * contract. Rich semantic metadata belongs to the data packages.
 *
 * @deprecated Legacy UI compatibility type. New tables should define a local
 * column/property contract containing only the metadata they consume.
 */
export interface Property {
  name: string
  caption?: string
  description?: string
  visible?: boolean
  dataType?: string
  type?: string
  formatter?: string
}
