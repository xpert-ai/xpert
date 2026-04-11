import { Type } from '@angular/core'
import { IStoryWidget } from '@xpert-ai/core'
import { ComponentSettingsType, STORY_WIDGET_COMPONENT, WidgetComponentType } from '@xpert-ai/story/core'

export const STORY_WIDGET_COMPONENTS = [
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalCard,
      mapping: [
        'title',
        'dataSettings',
        'selectionPresentationVariants',
        'options',
        'styling',
        'chartOptions',
        'chartSettings'
      ],
      label: 'Analytical Card',
      category: 'card',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { WidgetAnalyticalCardComponent } = await import('@xpert-ai/story/widgets/analytical-card')
        return WidgetAnalyticalCardComponent
      }
    },
    multi: true
  },

  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.AnalyticalGrid,
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      label: 'Analytical Grid',
      category: 'table',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { WidgetAnalyticalGridComponent } = await import('@xpert-ai/story/widgets/analytical-grid')
        return WidgetAnalyticalGridComponent
      }
    },
    multi: true
  },
  
  // FilterBar
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: ComponentSettingsType.StoryFilterBar,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxSmartFilterBarComponent } = await import('@xpert-ai/story/widgets/filter-bar')
        return NxSmartFilterBarComponent
      },
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      menu: [
        {
          icon: 'edit',
          action: 'edit',
          label: 'Edit Input Control'
        }
      ],
      icon: 'view_agenda',
      label: '过滤器栏',
      disableFab: true,
    },
    multi: true
  },

  // InputControl
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.InputControl,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxInputControlComponent } = await import('@xpert-ai/story/widgets/input-control')
        return NxInputControlComponent
      },
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      menu: [
        {
          icon: 'edit',
          action: 'edit',
          label: 'Edit Input Control'
        }
      ],
      icon: 'toggle_on',
      disableFab: true,
      category: 'control'
    },
    multi: true
  },
  
  // Kpi
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.KpiCard,
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      label: 'KPI',
      disableFab: true,
      category: 'kpi',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetKpiComponent } = await import('@xpert-ai/story/widgets/kpi')
        return NxWidgetKpiComponent
      }
    },
    multi: true
  },

  // TabGroup
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: 'TabGroup',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetTabGroupComponent } = await import('@xpert-ai/story/widgets/tab-group')
        return NxWidgetTabGroupComponent
      },
      mapping: ['title', 'options', 'styling'],
      icon: 'tab',
      label: 'Tab Group',
      category: 'card',
    },
    multi: true
  },
  // Iframe widget
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.Iframe,
      mapping: ['title', 'options', 'styling'],
      label: 'Iframe',
      disableFab: true,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetIframeComponent } = await import('@xpert-ai/story/widgets/iframe')
        return NxWidgetIframeComponent
      }
    },
    multi: true
  },

  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.Document,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetDocumentComponent } = await import('@xpert-ai/story/widgets/document')
        return NxWidgetDocumentComponent
      },
      mapping: ['dataSettings', 'title', 'options', 'styling'],
      icon: 'post_add',
      label: 'Document',
      disableFab: true
    },
    multi: true
  },

  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      group: 'Indicator',
      type: 'AccountingStatement',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { AccountingStatementComponent } = await import('@xpert-ai/story/widgets/financial/accounting-statement')
        return AccountingStatementComponent
      },
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      icon: 'currency_yen',
      label: 'Financial Table',
      category: 'table'
    },
    multi: true
  },

  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      group: 'Indicator',
      type: 'IndicatorCard',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { IndicatorCardComponent } = await import('@xpert-ai/story/widgets/indicator-card')
        return IndicatorCardComponent
      },
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      menu: [],
      icon: 'score',
      label: 'Indicator Card',
      category: 'card'
    },
    multi: true
  },

  // Swiper
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: 'Swiper',
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetSwiperComponent } = await import('@xpert-ai/story/widgets/swiper')
        return NxWidgetSwiperComponent
      },
      mapping: ['title', 'options', 'styling'],
      menu: [
        {
          icon: 'edit',
          action: 'edit',
          label: 'Edit Input Control'
        }
      ],
      icon: 'swipe',
      label: 'Swiper'
    },
    multi: true
  },

  // Text
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.Text,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetTextComponent } = await import('@xpert-ai/story/widgets/text')
        return NxWidgetTextComponent
      },
      mapping: ['title', 'dataSettings', 'options', 'styling'],
      menu: [
        {
          icon: 'edit',
          action: 'edit',
          label: 'Edit Input Control'
        }
      ],
      icon: 'format_color_text',
      label: 'Text',
      disableFab: true,
    },
    multi: true
  },

  // Image
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.Image,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetImageComponent } = await import('@xpert-ai/story/widgets/image')
        return NxWidgetImageComponent
      },
      mapping: ['title', 'options', 'styling'],
      icon: 'image',
      label: 'Image',
      disableFab: true,
      menu: []
    },
    multi: true
  },
  // Video
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.Video,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { NxWidgetVideoComponent } = await import('@xpert-ai/story/widgets/video')
        return NxWidgetVideoComponent
      },
      mapping: ['title', 'options', 'styling'],
      icon: 'ondemand_video',
      label: 'Video',
      disableFab: true,
      menu: []
    },
    multi: true
  },

  // Today
  {
    provide: STORY_WIDGET_COMPONENT,
    useValue: {
      type: WidgetComponentType.Today,
      factory: async (): Promise<Type<IStoryWidget<unknown>>> => {
        const { WidgetTodayComponent } = await import('@xpert-ai/story/widgets/today')
        return WidgetTodayComponent
      },
      mapping: ['title', 'options', 'styling'],
      icon: 'today',
      label: 'Today',
      disableFab: true,
      menu: []
    },
    multi: true
  },
]
