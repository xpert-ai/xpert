
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, effect, input, signal } from '@angular/core'
import { DensityDirective, DisplayDensity } from '@metad/ocap-angular/core'
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
import { NgmDisplayBehaviourComponent } from '../display-behaviour/display-behaviour.component'
import { type ZardIconSizeVariants, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [ZardIconComponent, DensityDirective, NgmDisplayBehaviourComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-property',
  templateUrl: './property.component.html',
  styleUrls: ['./property.component.scss'],
  host: {
    class: 'ngm-property'
  }
})
export class NgmPropertyComponent {
  AGGREGATION_ROLE = AggregationRole

  /**
   * Inputs
   */
  readonly property = input<PropertyAttributes | null>(null)
  readonly displayBehaviour = input<DisplayBehaviour | string | null>(null)
  readonly displayDensity = input<DisplayDensity | null>(null)
  readonly hiddenIcon = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly highlight = input<string | null>(null)
  // readonly calculationType = input<CalculationType>(null)
  readonly role = input<AggregationRole | null>(null)

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
  let icon: string  | null = null
  let label: Semantics | string | null | undefined = null
  switch (property?.role) {
    case AggregationRole.dimension:
      if (isSemanticCalendar(property)) {
        icon = 'schedule'
        label = 'Calendar'
      } else if (property.semantics?.semantic && SemanticIconMap[property.semantics.semantic]) {
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
