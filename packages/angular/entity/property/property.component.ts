import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, effect, input, signal } from '@angular/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
import { type ZardIconSizeVariants, ZardIconComponent } from '@xpert-ai/headless-ui'
import {
  AggregationRole,
  DisplayBehaviour,
  EntityProperty,
  PropertyAttributes,
  Semantics,
  isCalculationProperty,
  isIndicatorMeasureProperty,
  isMeasureControlProperty,
  isParameterProperty,
  isSemanticCalendar
} from '@metad/ocap-core'

@Component({
  standalone: true,
  imports: [CommonModule, ZardIconComponent, DensityDirective, NgmCommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-entity-property',
  templateUrl: './property.component.html',
  styleUrls: ['./property.component.scss'],
  host: {
    class: 'ngm-entity-property'
  }
})
export class NgmEntityPropertyComponent {
  AGGREGATION_ROLE = AggregationRole

  /**
   * Inputs
   */
  readonly property = input<PropertyAttributes>(null)
  readonly displayBehaviour = input<DisplayBehaviour | string>(null)
  readonly displayDensity = input<DisplayDensity>(null)
  readonly hiddenIcon = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly highlight = input<string>(null)
  // readonly calculationType = input<CalculationType>(null)
  readonly role = input<AggregationRole>(null)

  readonly icon = signal<string | null>(null)
  readonly iconSize = computed<ZardIconSizeVariants>(() =>
    this.displayDensity() === DisplayDensity.compact ? 'lg' : 'xl'
  )

  constructor() {
    effect(() => {
      const property = this.property()
      const role = this.role()
      this.icon.set(property
        ? propertyIcon({
            ...property,
            role: role ?? property.role
          }).icon
        : null)
    }, { allowSignalWrites: true })
  }
}

export const SemanticIconMap = {
  [Semantics['Address.Country']]: 'public'
}

export function propertyIcon(property: EntityProperty) {
  let icon = null
  let label = null
  switch (property?.role) {
    case AggregationRole.dimension:
      if (isSemanticCalendar(property)) {
        icon = 'schedule'
        label = 'Calendar'
      } else if (SemanticIconMap[property.semantics?.semantic]) {
        icon = SemanticIconMap[property.semantics?.semantic]
        label = property.semantics?.semantic
      } else {
        icon = 'tag'
        label = 'Dimension'
      }
      break
    case AggregationRole.hierarchy:
      icon = 'h_mobiledata'
      label = 'Hierarchy'
      break
    case AggregationRole.level:
      icon = 'format_list_numbered_rtl'
      label = 'Level'
      break
    case AggregationRole.variable:
      icon = 'priority_high'
      label = 'Variable'
      break
    case AggregationRole.measure:
      if (isCalculationProperty(property)) {
        if (isMeasureControlProperty(property)) {
          icon = 'alternate_email'
          label = 'Measure Control'
        } else if (isIndicatorMeasureProperty(property)) {
          icon = 'trending_up'
          label = 'Indicator'
        } else {
          icon = 'functions'
          label = 'Calculation'
        }
      } else {
        icon = 'straighten'
        label = 'Measure'
      }
      break
    default:
      if (isParameterProperty(property)) {
        icon = 'alternate_email'
        label = 'Parameter'
      }
  }
  return { icon, label }
}
