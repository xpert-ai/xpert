import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  AiFeatureEnum,
  AnalyticsFeatures,
  FeatureEnum,
  FeatureService,
  IFeatureOrganizationUpdateInput
} from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { pick } from 'lodash'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { map } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, CdkListboxModule, FormsModule],
  providers: [FeatureService],
  selector: 'xp-feature-category',
  templateUrl: './feature-category.component.html',
  styleUrls: ['./feature-category.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class FeatureCategoryComponent {
  protected cva = inject<NgxControlValueAccessor<{feature: IFeatureOrganizationUpdateInput; category: 'ai' | 'bi' | string}[]>>(NgxControlValueAccessor)
  private readonly _featureService = inject(FeatureService)
  readonly destroyRef = inject(DestroyRef)

  readonly featuresSignal = toSignal(
    this._featureService.getParentFeatures(['children']).pipe(map(({ items }) => items)),
    { initialValue: [] }
  )

  readonly features = model<string[]>(['ai'])
  readonly featureCategories = signal([
    {
      value: 'ai',
      features: [AiFeatureEnum.FEATURE_COPILOT, AiFeatureEnum.FEATURE_XPERT]
    },
    {
      value: 'bi',
      features: [
        AnalyticsFeatures.FEATURE_INDICATOR,
        AnalyticsFeatures.FEATURE_INDICATOR_MARKET,
        AnalyticsFeatures.FEATURE_INDICATOR_APP,
        AnalyticsFeatures.FEATURE_STORY,
        AnalyticsFeatures.FEATURE_MODEL,
        AnalyticsFeatures.FEATURE_PROJECT,
        FeatureEnum.FEATURE_HOME
      ]
    }
  ])

  constructor() {
    effect(
      () => {
        const enabledFeatures = this.features()
        const systemFeatures = this.featuresSignal()
        const features = this.featureCategories()
          .map((category) =>
            category.features.map((feature) => {
              return {
                feature: systemFeatures.find((item) => item.code === feature),
                category: category.value
              }
            })
          )
          .flat()
          .filter((item) => !!item.feature)
          .map(({ feature, category }) => ({
            feature: {
              featureId: feature.id,
              feature: pick(feature, ['id', 'name', 'code']),
              isEnabled: enabledFeatures.includes(category)
            },
            category
          }))

        this.cva.writeValue(features)
      },
      { allowSignalWrites: true }
    )
  }
}
