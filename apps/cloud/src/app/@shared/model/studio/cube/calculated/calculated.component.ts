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
import { C_MEASURES, CalculatedMember, nonBlank, serializeUniqueName } from '@metad/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, map, switchMap } from 'rxjs/operators'
import { CubeStudioComponent } from '../../studio.component'
import { ModelStudioService } from '../../../model.service'
import { HiddenLLM } from '../../../schema'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-calculated-settings',
  templateUrl: 'calculated.component.html',
  styleUrls: ['calculated.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-calculated-settings'
  }
})
export class CubeStudioCalculatedSettingsComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly i18n = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly calculated = model<CalculatedMember>()

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
  readonly schema = this.studio.schema
  readonly dimension = computed(() => this.calculated()?.dimension)
  readonly sharedDimensions = computed(() => this.schema()?.dimensions)

  readonly runtimeDimensions = computed(() => {
    const cube = this.cube()
    const sharedDimensions = this.sharedDimensions()
    const dimensions = [
      {
        key: null,
        value: null,
        caption: this.i18n.instant('PAC.KEY_WORDS.None', { Default: 'None' }),
        hierarchies: []
      },
      {
        key: C_MEASURES,
        value: C_MEASURES,
        caption: this.i18n.instant('PAC.KEY_WORDS.Measures', { Default: 'Measures' })
      }
    ]

    cube.dimensions?.forEach((dimension) => {
      dimensions.push({
        key: serializeUniqueName(dimension.name),
        value: serializeUniqueName(dimension.name),
        caption: dimension.caption || dimension.name,
        hierarchies: dimension.hierarchies?.map((hierarchy) => ({
          key: serializeUniqueName(dimension.name, hierarchy.name),
          value: serializeUniqueName(dimension.name, hierarchy.name),
          caption: hierarchy.caption || hierarchy.name
        }))
      })
    })
    cube.dimensionUsages?.forEach((dimensionUsage) => {
      const sourceDimension = sharedDimensions?.find((d) => d.name === dimensionUsage.source)
      dimensions.push({
        key: serializeUniqueName(dimensionUsage.name),
        value: serializeUniqueName(dimensionUsage.name),
        caption: dimensionUsage.caption || dimensionUsage.name,
        hierarchies: sourceDimension?.hierarchies?.map((hierarchy) => ({
          key: serializeUniqueName(sourceDimension.name, hierarchy.name),
          value: serializeUniqueName(sourceDimension.name, hierarchy.name),
          caption: hierarchy.caption || hierarchy.name
        }))
      })
    })
    return dimensions
  })

  readonly rtHierarchies = computed(() => {
    const runtimeDimensions = this.runtimeDimensions()
    const dimension = this.dimension()

    if (dimension === C_MEASURES) {
      return [
        {
          key: C_MEASURES,
          value: C_MEASURES,
          caption: this.i18n.instant('PAC.KEY_WORDS.Measures', { Default: 'Measures' })
        }
      ]
    }

    return runtimeDimensions.find((item) => item.key === dimension)?.hierarchies
  })

  readonly runtimeDimensions$ = toObservable(this.runtimeDimensions)

  readonly rtHierarchies$ = toObservable(this.rtHierarchies)

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
    const CALCULATED_MEMBER = this.SCHEMA().CALCULATED_MEMBER
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
              label: COMMON?.Name || 'Name',
              required: true,
              appearance: 'standard'
            }
          },
          {
            key: 'caption',
            type: 'input',
            className,
            props: {
              label: COMMON?.Caption ?? 'Caption',
              appearance: 'standard'
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
          }
        ]
      },
      {
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            key: 'dimension',
            type: 'ngm-select',
            className,
            props: {
              label: COMMON?.Dimension ?? 'Dimension',
              valueKey: 'key',
              options: this.runtimeDimensions$,
              searchable: true,
              appearance: 'standard'
            }
            // validators: {
            //   ip: {
            //     expression: (c) => (c.parent.value.hierarchy && !c.value) || (!c.parent.value.hierarchy && c.value) ,
            //     message: `维度和层级必输一个且不能同时设置`,
            //   },
            // },
          },
          {
            key: 'hierarchy',
            type: 'ngm-select',
            className,
            props: {
              label: COMMON?.Hierarchy ?? 'Hierarchy',
              valueKey: 'key',
              options: this.rtHierarchies$,
              searchable: true,
              appearance: 'standard'
            },
            expressionProperties: {
              hide: `!model || model.dimension==='Measures'`
            }
            // validators: {
            //   ip: {
            //     expression: (c) => (c.parent.value.dimension && !c.value) || (!c.parent.value.dimension && c.value) ,
            //     message: `维度和层级必输一个且不能同时设置`,
            //   },
            // },
          },
          {
            key: 'parent',
            type: 'input',
            className,
            props: {
              label: CALCULATED_MEMBER?.Parent ?? 'Parent',
              appearance: 'standard'
            }
          },
          {
            className,
            key: 'visible',
            type: 'checkbox',
            // defaultValue: true,
            props: {
              label: COMMON?.Visible ?? 'Visible',
              appearance: 'standard'
            }
          },
          {
            className,
            key: 'dataType',
            type: 'select',
            props: {
              label: COMMON?.DataType ?? 'Data Type',
              options: [
                { value: null, label: this.getTranslation('PAC.KEY_WORDS.None', { Default: 'None' }) },
                { value: 'String', label: 'String' },
                { value: 'Integer', label: 'Integer' },
                { value: 'Numeric', label: 'Numeric' }
              ],
              appearance: 'standard'
            }
          },
          {
            key: 'solveOrder',
            type: 'input',
            className,
            props: {
              label: CALCULATED_MEMBER?.SolveOrder ?? 'Solve Order',
              placeholder: 'Number',
              appearance: 'standard'
            }
          },
          {
            className: FORMLY_W_FULL,
            key: 'formula',
            type: 'textarea',
            props: {
              label: CALCULATED_MEMBER?.Formula ?? 'Formula',
              autosize: true,
              required: true,
              appearance: 'fill'
            }
          }
        ]
      },
      {
        key: 'formatting',
        fieldGroupClassName: FORMLY_ROW,
        fieldGroup: [
          {
            className,
            key: 'unit',
            type: 'input',
            props: {
              label: COMMON?.Unit ?? 'Unit',
              appearance: 'standard'
            }
          },
          {
            className,
            key: 'decimal',
            type: 'input',
            props: {
              label: COMMON?.Decimal ?? 'Decimal',
              appearance: 'standard'
            }
          }
        ]
      },

      {
        key: 'semantics',
        wrappers: ['panel'],
        props: {
          label: COMMON?.Semantics ?? 'Semantics'
        },
        fieldGroup: [
          {
            fieldGroupClassName: FORMLY_ROW,
            fieldGroup: [HiddenLLM(COMMON)]
          }
        ]
      }
    ]
  }
}
