import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import { FORMLY_W_1_2 } from '@metad/formly'
import { DensityDirective } from '@metad/ocap-angular/core'
import { DimensionUsage, nonBlank } from '@metad/ocap-core'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { filter, map, switchMap } from 'rxjs/operators'
import { CubeStudioComponent } from '../../studio.component'
import { ModelStudioService } from '../../studio.service'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-dimension-usage',
  templateUrl: 'usage.component.html',
  styleUrls: ['usage.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, FormlyModule, DensityDirective],
  host: {
    class: 'xp-cube-studio-dimension-usage'
  }
})
export class CubeStudioDimensionUsageComponent {
  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly elementRef = inject(ElementRef)
  readonly i18n = inject(I18nService)
  readonly helpWebsite = injectHelpWebsite()

  // Inputs
  readonly usage = model<DimensionUsage>()

  // Outputs
  readonly close = output<void>()

  readonly formGroup = new FormGroup({})
  readonly fields = computed(() => this.getFields())
  readonly options = {}

  // States
  readonly SCHEMA = toSignal(this.i18n.stream('PAC.MODEL.SCHEMA'))
  readonly HIERARCHY = computed(() => this.SCHEMA()?.HIERARCHY ?? {})

  readonly draft$ = this.studioService.draft$
  readonly sharedDimensionOptions$ = this.draft$.pipe(
    map((draft) => draft?.schema?.dimensions?.map((dimension) => ({ key: dimension.name, caption: dimension.caption })))
  )
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

  constructor() {
    effect(() => {
      console.log(this.fields())
    })
  }

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

  getTranslationFun() {
    return (key: string, interpolateParams?: any) => {
      return this.i18n.instant(key, interpolateParams)
    }
  }

  getFields() {
    const COMMON = this.SCHEMA().COMMON
    const className = FORMLY_W_1_2
    return [
      {
        className,
        key: 'name',
        type: 'input',
        props: {
          required: true,
          label: COMMON?.Name ?? 'Name'
        }
      },
      {
        className,
        key: 'caption',
        type: 'input',
        props: {
          label: COMMON?.Caption ?? 'Caption'
        }
      },
      {
        className,
        key: 'source',
        type: 'ngm-select',
        props: {
          label: COMMON?.SourceDimension ?? 'Source Dimension',
          options: this.sharedDimensionOptions$,
          valueKey: 'key'
        }
      },
      {
        className,
        key: 'foreignKey',
        type: 'ngm-select',
        props: {
          required: true,
          searchable: true,
          label: COMMON?.FactForeignKey ?? 'Foreign Key of Fact',
          options: this.factFields$,
          valueKey: 'key'
        }
      },
      {
        className: FORMLY_W_1_2,
        key: 'visible',
        type: 'checkbox',
        defaultValue: true,
        props: {
          label: COMMON?.Visible ?? 'Visible'
        }
      }
    ]
  }
}
