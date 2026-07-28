import { DisplayDensity } from '../directives/displayDensity'

export type NgmFieldAppearance = 'fill' | 'outline' | 'standard' | 'legacy'
export type NgmFloatLabel = 'always' | 'auto' | 'never'
export type NgmFieldColor = 'primary' | 'accent' | 'warn' | null | undefined
export type NgmTabHeaderPosition = 'above' | 'below'

export interface NgmAppearance {
  appearance?: NgmFieldAppearance
  floatLabel?: NgmFloatLabel
  color?: NgmFieldColor
  hideRequiredMarker?: boolean
  /**
   * @deprecated use `displayDensity` independently
   */
  displayDensity?: DisplayDensity
}
