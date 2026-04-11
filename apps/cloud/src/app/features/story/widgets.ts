import { Type } from '@angular/core'
import { WidgetStylingSchema } from '@xpert-ai/story'
import { ComponentSettingsType, WidgetComponentType } from '@xpert-ai/story/core'
import { DesignerSchema, NxComponentSettingsComponent, STORY_DESIGNER_COMPONENT } from '@xpert-ai/story/designer'
import { PageDesignerComponent, StoryDesignerComponent, WidgetDesignerComponent } from './designer/index'

export const STORY_DESIGNER_COMPONENTS = [
  // Story designer
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: ComponentSettingsType.Story + 'Style',
      component: StoryDesignerComponent
    },
    multi: true
  },
  // Page designer
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: ComponentSettingsType.StoryPoint + 'Style',
      component: PageDesignerComponent
    },
    multi: true
  },
  // Analytical Card
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalCard,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { AnalyticalCardSchemaService } = await import('@xpert-ai/story/widgets/analytical-card')
        return AnalyticalCardSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalCard + '/Style',
      component: NxComponentSettingsComponent,
      schema: WidgetStylingSchema
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'ChartOptions',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { ChartOptionsSchemaService } = await import('@xpert-ai/story/widgets/analytical-card')
        return ChartOptionsSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'MeasureReferenceLine',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { ReferenceLineSchemaService } = await import('@xpert-ai/story/widgets/analytical-card')
        return ReferenceLineSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'MeasureChartOptions',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { MeasureChartOptionsSchemaService } = await import('@xpert-ai/story/widgets/analytical-card')
        return MeasureChartOptionsSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'DimensionChartOptions',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { DimensionChartOptionsSchemaService } = await import('@xpert-ai/story/widgets/analytical-card')
        return DimensionChartOptionsSchemaService
      }
    },
    multi: true
  },

  // Analytical Grid
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalGrid,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { AnalyticalGridSchemaService } = await import('@xpert-ai/story/widgets/analytical-grid')
        return AnalyticalGridSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalGrid + '/Style',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { AnalyticalGridStylingSchema } = await import('@xpert-ai/story/widgets/analytical-grid')
        return AnalyticalGridStylingSchema
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalGrid + '/Column',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { AnalyticalGridColumnSchemaService } = await import('@xpert-ai/story/widgets/analytical-grid')
        return AnalyticalGridColumnSchemaService
      }
    },
    multi: true
  },

  // FilterBar
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: ComponentSettingsType.StoryFilterBar,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { StoryFilterBarSchemaService } = await import('@xpert-ai/story/widgets/filter-bar')
        return StoryFilterBarSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: ComponentSettingsType.FilterBarField,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { FilterBarFieldSchemaService } = await import('@xpert-ai/story/widgets/filter-bar')
        return FilterBarFieldSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: ComponentSettingsType.FilterBarField + '/Date',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { FilterBarDateSchemaService } = await import('@xpert-ai/story/widgets/filter-bar')
        return FilterBarDateSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.FilterBar + '/Style',
      component: NxComponentSettingsComponent,
      schema: WidgetStylingSchema
    },
    multi: true
  },

  // InputControl
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.InputControl,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { InputControlSchemaService } = await import('@xpert-ai/story/widgets/input-control')
        return InputControlSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.InputControl + '/Style',
      component: NxComponentSettingsComponent,
      schema: WidgetStylingSchema
    },
    multi: true
  },

  // kpi
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.KpiCard,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { KpiSchemaService } = await import('@xpert-ai/story/widgets/kpi')
        return KpiSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.KpiCard + '/Style',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { KpiStylingSchema } = await import('@xpert-ai/story/widgets/kpi')
        return KpiStylingSchema
      }
    },
    multi: true
  },

  // TabGroup
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'TabGroup',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { TabGroupSchemaService } = await import('@xpert-ai/story/widgets/tab-group')
        return TabGroupSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'TabGroup/Style',
      component: NxComponentSettingsComponent,
      schema: WidgetStylingSchema
    },
    multi: true
  },

  // iFrame
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Iframe,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { IFrameSchemaService } = await import('@xpert-ai/story/widgets/iframe')
        return IFrameSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Iframe + '/Style',
      component: WidgetDesignerComponent
    },
    multi: true
  },

  // Document
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Document,
      component: NxComponentSettingsComponent,

      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { DocumentSchemaService } = await import('@xpert-ai/story/widgets/document')
        return DocumentSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Document + '/Style',
      component: WidgetDesignerComponent
    },
    multi: true
  },

  // Accounting Statement
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'AccountingStatement',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { AccountingStatementSchemaService } = await import(
          '@xpert-ai/story/widgets/financial/accounting-statement'
        )
        return AccountingStatementSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'AccountingStatement/Style',
      component: WidgetDesignerComponent
    },
    multi: true
  },

  // Indicator Card
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'IndicatorCard',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { IndicatorCardSchemaService } = await import('@xpert-ai/story/widgets/indicator-card')
        return IndicatorCardSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'IndicatorCard/Style',
      component: WidgetDesignerComponent
    },
    multi: true
  },

  // Swipers
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'Swiper',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { SwiperSchemaService } = await import('@xpert-ai/story/widgets/swiper')
        return SwiperSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: 'Swiper/Style',
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { SlideStylingSchema } = await import('@xpert-ai/story/widgets/swiper')
        return SlideStylingSchema
      }
    },
    multi: true
  },
  // Text
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Text,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { TextSchemaService } = await import('@xpert-ai/story/widgets/text')
        return TextSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: `${WidgetComponentType.Text}/Style`,
      component: WidgetDesignerComponent
    },
    multi: true
  },
  // Image
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Image,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { ImageSchemaService } = await import('@xpert-ai/story/widgets/image')
        return ImageSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: `${WidgetComponentType.Image}/Style`,
      component: WidgetDesignerComponent
    },
    multi: true
  },
  // Video
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Video,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { ImageSchemaService } = await import('@xpert-ai/story/widgets/video')
        return ImageSchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: `${WidgetComponentType.Video}/Style`,
      component: WidgetDesignerComponent
    },
    multi: true
  },

  // Today
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: WidgetComponentType.Today,
      component: NxComponentSettingsComponent,
      factory: async (): Promise<Type<DesignerSchema<unknown>>> => {
        const { TodaySchemaService } = await import('@xpert-ai/story/widgets/today')
        return TodaySchemaService
      }
    },
    multi: true
  },
  {
    provide: STORY_DESIGNER_COMPONENT,
    useValue: {
      type: `${WidgetComponentType.Today}/Style`,
      component: NxComponentSettingsComponent,
      schema: WidgetStylingSchema
    },
    multi: true
  },
]
