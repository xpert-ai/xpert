import { DisplayDensity } from '../directives/displayDensity'

export type XpFieldAppearance = 'fill' | 'outline' | 'standard' | 'legacy'
export type XpFloatLabel = 'always' | 'auto' | 'never'
export type XpFieldColor = 'primary' | 'accent' | 'warn' | null | undefined
export type XpTabHeaderPosition = 'above' | 'below'

export interface XpAppearance {
  appearance?: XpFieldAppearance
  floatLabel?: XpFloatLabel
  color?: XpFieldColor
  hideRequiredMarker?: boolean
  /**
   * @deprecated use `displayDensity` independently
   */
  displayDensity?: DisplayDensity
}
