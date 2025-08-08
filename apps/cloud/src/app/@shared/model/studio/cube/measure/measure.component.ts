import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  model,
  output
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormGroup, FormsModule } from '@angular/forms'
import { injectHelpWebsite } from '@cloud/app/@core'
import { I18nService } from '@cloud/app/@shared/i18n'
import { FORMLY_ROW, FORMLY_W_1_2, FORMLY_W_FULL } from '@metad/formly'
import { DensityDirective } from '@metad/ocap-angular/core'
import { nonBlank, PropertyMeasure } from '@metad/ocap-core'
import { AccordionWrappers } from '@metad/story/designer'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, map, switchMap } from 'rxjs/operators'
import { CubeStudioComponent } from '../../studio.component'
import { ModelStudioService } from '../../../model.service'
import { HiddenLLM, MeasureExpressionAccordion } from '../../../schema'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-measure-settings',
  templateUrl: 'measure.component.html',
  styleUrls: ['measure.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-measure-settings'
  }
})
export class CubeStudioMeasureSettingsComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly i18n = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly measure = model<PropertyMeasure>()

  // Outputs
  readonly close = output<void>()
  readonly remove = output<void>()

  readonly formGroup = new FormGroup({})
  readonly fields = computed(() => this.getFields())
  readonly options = {}

  // States
  readonly SCHEMA = toSignal(this.i18n.stream('PAC.MODEL.SCHEMA'))
  readonly HIERARCHY = computed(() => this.SCHEMA()?.HIERARCHY ?? {})

  readonly cube = this.studio.cube

  /**
   * Original Fact table fields
   */
  readonly factFields$ = toObservable(this.studio.factName).pipe(
    filter(nonBlank),
    switchMap((table) => this.studioService.selectOriginalEntityProperties(table)),
    map((properties) => [
      {
        value: null,
        key: null,
        caption: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' })
      },
      ...properties.map((property) => ({
        value: property.name,
        key: property.name,
        caption: property.caption
      }))
    ])
  )

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: KeyboardEvent) {
    const element = this.elementRef.nativeElement as HTMLElement
    if (document.activeElement && element.contains(document.activeElement)) {
      this.close.emit()
    }
  }

  getTranslation(key: string, interpolateParams?: any) {
    return this.i18n.instant(key, interpolateParams)
  }

  getFields() {
    const COMMON = this.SCHEMA().COMMON
    const MEASURE = this.SCHEMA().MEASURE
    const className = FORMLY_W_1_2
    return [
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            key: 'name',
            type: 'input',
            className,
            props: {
              label: COMMON?.Name ?? 'Name',
              required: true
            }
          },
          {
            key: 'caption',
            type: 'input',
            className,
            props: {
              label: COMMON?.Caption ?? 'Caption'
            }
          },
          {
            className: FORMLY_W_FULL,
            key: 'description',
            type: 'textarea',
            props: {
              label: COMMON?.Description ?? 'Description',
              rows: 1,
              autosize: true
            }
          },
          {
            key: 'column',
            type: 'select',
            className,
            props: {
              label: COMMON?.Column ?? 'Column',
              options: this.factFields$,
              searchable: true
            },
            expressionProperties: {
              'props.required':
                '!(model.measureExpression && model.measureExpression.sql && model.measureExpression.sql.content)'
            }
          },
          {
            key: 'aggregator',
            type: 'select',
            className,
            props: {
              label: MEASURE?.Aggregator ?? 'Aggregator',
              options: [
                { value: 'sum', label: 'Sum' },
                { value: 'count', label: 'Count' },
                { value: 'min', label: 'Min' },
                { value: 'max', label: 'Max' },
                { value: 'avg', label: 'Avg' },
                { value: 'distinct-count', label: 'Distinct Count' }
              ]
            }
          },
          {
            className,
            key: 'datatype',
            type: 'select',
            props: {
              icon: 'ballot',
              label: COMMON?.DataType ?? 'Data Type',
              options: [
                { value: 'String', label: 'String' },
                { value: 'Integer', label: 'Integer' },
                { value: 'Numeric', label: 'Numeric' }
                // { value: 'Boolean', label: 'Boolean' },
                // { value: 'Date', label: 'Date' },
                // { value: 'Time', label: 'Time' },
                // { value: 'Timestamp', label: 'Timestamp' }
              ]
            }
          },
          {
            className,
            key: 'visible',
            type: 'checkbox',
            defaultValue: true,
            props: {
              label: COMMON?.Visible ?? 'Visible'
            }
          },
          {
            className: FORMLY_W_FULL,
            key: 'formatString',
            type: 'input',
            props: {
              label: MEASURE?.FormatString ?? 'Format String',
              icon: 'text_format'
            }
          }
        ]
      },
      ...AccordionWrappers([
        MeasureExpressionAccordion(COMMON, ''),
        {
          key: 'semantics',
          label: COMMON?.Semantics ?? 'Semantics',
          toggleable: true,
          props: {
            help: this.helpWebsite() + '/docs/models/dimension-designer/semantics/'
          },
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [HiddenLLM(COMMON)]
        }
      ])
    ]
  }
}
