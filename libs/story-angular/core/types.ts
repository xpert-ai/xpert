import { ComponentType } from '@angular/cdk/portal'
import { InjectionToken, TemplateRef, Type } from '@angular/core'
import { MatTabHeaderPosition } from '@angular/material/tabs'
import {
  Accessibility,
  IDataSource,
  INotificationDestination,
  IScreenshot,
  ISemanticModel,
  ISemanticModelPreferences,
  IStory,
  ISubscription
} from '@metad/contracts'
import { DisplayDensity, NgmAppearance, ThemesEnum } from '@metad/ocap-angular/core'
import {
  DataSettings,
  DataSourceOptions,
  EntityType,
  IFilter,
  Indicator,
  ISlicer,
  Schema,
  TimeGranularity,
  UUID
} from '@metad/ocap-core'
import { NxWatermarkOptions } from '@metad/components/trial-watermark'
import { DefaultDataSettings, IStoryWidget } from '@metad/core'
import { GridsterConfig, GridsterItem } from 'angular-gridster2'
import ShortUniqueId from 'short-unique-id'

export const I18N_STORY_NAMESPACE = 'Story'

export const uuid = new ShortUniqueId({ length: 10 })

export type ID = string

export interface AdminData {
  createdTime: Date
  createdUserCode: string
  createdUser: string
  updatedBy: string
  lastChangedTime: Date
  lastChangedUserCode: string
  lastChangedUser: string
}

export type cssStyle = any

export interface ComponentStyling {
  padding?: number
  borderRadius?: number
  backgroundColor: string;
  background?: string
  backgroundImage?: string
  backgroundImageObj: IScreenshot
  backgroundSize?: string
  backgroundRepeat?: string
  backdropFilter?: string
  borderColor?: string
  borderWidth?: number
  borderStyle?: string
  borderImageObj: IScreenshot
  borderImageWidth?: number
  borderImageSlice?: number
  boxShadow?: string
  shadowColor?: string
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowBlur?: number
  shadowSpread?: number
  color?: string
  textAlign?: string
  fontSize?: number
  lineHeight?: number
  fontFamily?: string
  fontWeight?: string
  textShadow?: string
  // transform property
  transform?: string
  transformOrigin?: string
  filter?: string
  opacity?: number
}

export enum PageHeaderLabelEnum {
  auto = 'auto',
  always = 'always',
  never = 'never'
}

/**
 * 1. Story preferences
 * 2. Page preferences
 * 3. Widgets preferences
 */
export interface StoryPreferences {
  storyStyling?: ComponentStyling
  story?: {
    tabBar?: 'fixed' | 'point' | 'hidden' | null
    pageHeaderPosition?: MatTabHeaderPosition
    pageHeaderStretchTabs?: boolean
    pageHeaderAlignTabs?: 'start' | 'center' | 'end'
    pageHeaderShowLabel?: boolean | PageHeaderLabelEnum
    pageHeaderFitInkBarToContent?: boolean
    enableWatermark?: boolean
    watermarkOptions?: NxWatermarkOptions
    /**
     * @deprecated use displayDensity
     * Global appearance for all widgets in this story
     */
    appearance?: NgmAppearance
    displayDensity?: DisplayDensity
    /**
     * @deprecated use storyStyling
     */
    styling?: cssStyle

    themeName?: ThemesEnum
    // Golbal options for all widgets in this story
    colors?: string[]
  }

  defaultGridOptions?: GridsterConfig
  pageStyling?: cssStyle
  /**
   * @deprecated use defaultGridOptions pageStyling
   */
  page?: {
    position: string
    defaultGridOptions: GridsterConfig
    styles: cssStyle
  },
  widget?: {
    styling?: ComponentStyling
  }
  card?: {
    styling?: ComponentStyling
  },
  table?: {
    styling?: ComponentStyling
  },
  text?: {
    styling?: ComponentStyling
  },
  control?: {
    styling?: ComponentStyling
  },
  kpi?: {
    /**
     * Styles for the KPI component
     */
    styling?: ComponentStyling
    /**
     * Styles for the KPI title text
     */
    title?: ComponentStyling
    /**
     * Styles for the KPI value text
     */
    value?: ComponentStyling
  }
  //
  options?: any
}

export interface StoryOptions {
  /**
   * 模型在故事中的别名, 防止模型改名或者重新创建(id变换)后的配置丢失.
   */
  modelAlias?: string
  stylesheets?: Array<{
    href: string
    media?: string
    type?: string
  }>
  /**
   * 国家语言代码
   */
  locale?: string

  /**
   * @deprecated use preferences.story.themeName
   * 主题
   */
  themeName?: 'system' | 'light' | 'dark' | 'thin' | string
  /**
   * 显示为全屏
   */
  fullscreen?: boolean
  showFullscreenButton?: boolean
  hideStoryFilterBar?: boolean
  selectedPointIndex?: number
  filters?: Array<IFilter>
  preferences?: StoryPreferences
  advancedStyle?: string
  emulatedDevice?: EmulatedDevice
  /**
   * @deprecated use scale in StoryPointState
   * Transform scale base 100
   * * 70 means
    ```css
    transform: scale(.7);
    transform-origin: 0 0;
    ```
   */
  scale?: number

  echartsTheme?: any

  defaultDataSettings?: DefaultDataSettings
}

export enum CascadingEffect {
  InTurn = 'InTurn',
  All = 'All'
}

export interface StoryFilterBarOptions {
  // 实时刷新
  liveMode?: boolean
  /**
   * 是否启用栏内过滤器之间的级联联动
   */
  cascadingEffect?: boolean
  /**
   * 过滤器之间的级联联动类型
   */
  cascadingType?: CascadingEffect

  today?: {
    enable: boolean
    granularity: TimeGranularity
    granularitySequence: number
    defaultValue: string
  }
}

export interface StoryFilterBar {
  dataSettings: DataSettings
  opened: boolean
  options: StoryFilterBarOptions
  styling: {
    appearance: NgmAppearance
  }
}

export interface StoryKey {
  /**
   * Server State ID
   */
  id: ID
  /**
   * UI State Key
   */
  key: ID
}

export interface Story extends Partial<StoryKey>, Omit<IStory, 'points' | 'options'>, Accessibility {
  /**
   * @deprecated is using ?
   */
  title?: string
  filterBar?: Partial<StoryFilterBar>
  options?: StoryOptions
  points?: Array<StoryPoint>
  model?: StoryModel
  models?: StoryModel[]
  /**
   * @deprecated use schemas
   */
  schema?: Schema
  /**
   * 存储多数据源下的多模型语义增强
   */
  schemas?: {
    [key: string]: {
      [key: string]: EntityType
    }
  }
}

export interface StoryPointKey {
  storyId: ID
  /**
   * Server State ID
   */
  id: ID
  /**
   * UI State Key
   */
  key: ID
}

/**
 * Story 页面类型, 布局等
 */
export enum StoryPointType {
  Responsive,
  Canvas,
  Grid
}

export enum StoryPageSize {
  Dynamic = 'dynamic',
  Fixed = 'fixed'
}

/**
 * Story point styling
 */
export interface StoryPointStyling extends ComponentStyling {
  canvas: {
    'background-color': string
    background: string
  }
  background?: string
  cssOptions: any
  pageSize: {
    type: StoryPageSize
    size: 'A4' | 'A3'
    width: number
    height: number
    orientation: 'Portrait' | 'Landscape'
    continuousHeight: boolean
    fitPage: boolean
  }
}

export interface StoryPoint extends Partial<StoryPointKey> {
  // Story 页面类型
  type: StoryPointType
  // Story页标题名称
  name: string
  // Story 页里所有组件
  widgets?: Array<StoryWidget>
  // Grister 布局配置
  gridOptions?: GridsterConfig
  // 页面位置
  index?: number
  // 页面是否隐藏
  hidden?: boolean
  // 页面级限制条件， 展示在 StoryPoint 标签上， 通过页面 SmartFilterBarService 发出
  filters?: Array<ISlicer>
  /**
   * 页面级 FilterBar 配置
   * @deprecated 是否还需要
   */
  filterBar?: Partial<StoryFilterBar>
  /**
   * 是否全屏状态
   * @deprecated use fullscreen in StoryPointState
   */
  fullscreen?: boolean
  // cssOptions?: any
  responsive?: FlexLayout
  styling?: StoryPointStyling
}

export interface StoryWidgetKey {
  storyId: ID
  pointId: ID
  /**
   * Server State ID
   */
  id: ID
  /**
   * UI State Key
   */
  key: ID

  point?: StoryPoint
}

/**
 * Story widget styling
 * 包含了组件的样式，外观
 * 也包含了组件内部子部件的样式，外观
 * 此样式对象可以传递给组件内部， 由组件内部决定如何使用
 */
export interface WidgetStyling {
  component?: ComponentStyling
  appearance?: NgmAppearance
  // widget component styles
  widget?: {
    'background-color': string
    background: string
    height: string
  }
  // Layer attributes for widget
  layer?: {
    layerIndex?: number
  }
}

/**
 * Story Widget
 */
export interface StoryWidget extends StoryWidgetKey {
  name: string
  title?: string
  position: GridsterItem
  component: WidgetComponentType | string
  dataSettings?: DataSettings
  linkedAnalysis?: LinkedAnalysisSettings
  options?: any
  styling?: WidgetStyling;
  index?: number
  // 是否全屏状态
  fullscreen?: boolean
  isTemplate?: boolean
  // [key: string]: any
}

export interface StoryCommentKey {
  storyId: ID
  pointId: ID
  widgetId: ID
  commentKey: UUID
}

export interface StoryComment extends StoryCommentKey, Partial<AdminData> {
  type: string
  dimensions: any
  text: string
}

/**
 * @deprecated use `ISemanticModel` instead
 */
export interface StoryModel
  extends DataSourceOptions,
    Omit<Omit<Omit<ISemanticModel, 'options'>, 'agentType'>, 'type'> {
  preferences?: ISemanticModelPreferences
  indicators?: Array<Indicator>
  stories?: Array<IStory>
}

export interface IndicatorGroup {
  id: string
  principal?: string
  name?: string
  parentId?: string
  level?: number
}

export enum IndicatorType {
  BASIC = 'basic',
  DERIVE = 'derive'
}

/**
 * @deprecated
 *
 * 数据源(DataSources)或者系统连接(System Connections), 要找到数据源和系统之间的共同点, 统一模型
 */
export interface StoryConnection extends IDataSource {
  /**
   * 数据源默认的 catalog 对应 database | schema
   * 从 Semantic Model 上来
   */
  catalog?: string
  /**
   * 连接配置, 不同连接的配置会有不同
   */
  // options?: ConnectionOptions
}

export interface StoryCatalog {
  name: string
}

export interface StoryEntitySet {
  name: string
}

export interface StoryFeed extends Partial<AdminData> {
  /**
   * 用户账号
   */
  user?: string
  /**
   * Feed 类型
   */
  type: 'Story' | 'StoryWidget' | 'Component'
  /**
   * Feed Semantic ID
   */
  entityId: string
  options: {
    storyId: string
    pageKey: string
    widgetKey: string
  }
}

export enum WidgetComponentType {
  AnalyticalCard = 'AnalyticalCard',
  AnalyticalGrid = 'AnalyticalGrid',
  // StoryFilterBar = 'StoryFilterBar',
  FilterBar = 'FilterBar',
  KpiCard = 'KpiCard',
  InputControl = 'InputControl',
  AnalyticalGeography = 'AnalyticalGeography',
  Document = 'Document',
  Iframe = 'Iframe',
  Text = 'Text',
  Image = 'Image',
  Video = 'Video',
  Today = 'Today',
}

export enum ComponentSettingsType {
  Story = 'Story',
  StoryFilterBar = WidgetComponentType.FilterBar,
  FilterBarField = 'FilterBarField',
  LinkedAnalysis = 'LinkedAnalysis',
  StoryPoint = 'StoryPoint',
  FlexLayout = 'FlexLayout'
}

export enum LinkedInteractionApplyTo {
  OnlyThisWidget = 'OnlyThisWidget',
  AllWidgetsOnPage = 'AllWidgetsOnPage',
  OnlySelectedWidgets = 'OnlySelectedWidgets'
}

/**
 * 关联分析配置
 */
export interface LinkedAnalysisSettings {
  /**
   * 交互应用类型
   */
  interactionApplyTo: LinkedInteractionApplyTo
  /**
   * 自动关联新创建的部件
   */
  connectNewly?: boolean
  /**
   * 关联的部件
   */
  linkedWidgets?: Array<string>
}

export interface LinkedAnalysisEvent {
  originalWidget: ID
  linkedWidgets?: Array<string>
  slicers?: ISlicer[]
}

/**
 * Story Widget 组件提供者
 *
 * * type 不在 `WidgetComponentType` 类型中的则认为是第三方组件
 */
export interface StoryWidgetComponentProvider {
  type: WidgetComponentType | string
  import: () => Promise<any>
  component: ComponentType<IStoryWidget<any>>
  factory?: () => Promise<Type<IStoryWidget<unknown>>>
  mapping: string[]
  icon: string
  label: string
  isCard: boolean
  category: 'control' | 'card' | 'text' | 'table' | 'widget'
  disableFab: boolean
  menu: Array<{
    icon: string
    action: string
    label: string
  }>
}

export const STORY_WIDGET_COMPONENT = new InjectionToken<Array<StoryWidgetComponentProvider>>('STORY_WIDGET_COMPONENT')

export enum StoryEventType {
  SAVE,
  CREATE_WIDGET,
  PASTE_WIDGET,
  REMOVE_WIDGET
}

export interface StoryEvent {
  key: ID
  type: StoryEventType
  data: any
}

/**
 * State type for story point
 */
export interface StoryPointState {
  id: string
  /**
   * Inner state key
   */
  key: ID

  /**
   * Is point active
   */
  active?: boolean
  /**
   * Is point fetched
   */
  fetched?: boolean
  /**
   * Is point removed
   */
  removed?: boolean

  dirty?: boolean

  /**
   * Saving state
   */
  saving?: boolean
  /**
   * Current widget key
   */
  currentWidgetKey?: ID
  /**
   * Pasted widgets data
   */
  pasteWidgets?: Array<StoryWidget>
  /**
   * Current FlexLayout key
   */
  currentFlexLayoutKey?: ID
  /**
   * Linked analysis states
   */
  linkedAnalysis?: Record<string, LinkedAnalysisEvent>
  /**
   * Page transform scale, Transform scale base 100
   * 
   * For example: 70 means
    ```css
    transform: scale(.7);
    transform-origin: 0 0;
    ```
   */
  scale?: number

  /** 
   * Is fullscreen
   */
  fullscreen?: boolean
}

/**
 * State type for story
 */
export interface StoryState {
  /**
   * Story data type
   */
  story: Story
  /**
   * Is editable
   */
  editable?: boolean
  /**
   * Current page key
   */
  currentPageKey?: ID
  /**
   * States for sub pages
   */
  points: Array<StoryPointState>
  /**
   * Current widget data
   */
  currentWidget?: StoryWidget
  /**
   * Copyed selected widget data
   */
  copySelectedWidget?: StoryWidget
  /**
   * Creating widget item
   */
  creatingWidget?: Partial<StoryWidget>
  /**
   * Is authenticated
   */
  isAuthenticated?: boolean
  /**
   * Is pan mode
   */
  isPanMode?: boolean

  /**
   * Default data source and cube configuration used by default.
   */
  defaultDataSettings?: DefaultDataSettings

  /**
   * Secret token for shared private story
   */
  token?: string
}

/**
 * Default options for page grid
 *
 * @returns Grid options
 */
export function getDefaultPageGrid() {
  return {
    // gridType: GridType.Fixed,
    // setGridSize: true,
    // fixedColWidth: 100,
    // fixedRowHeight: 100,
    // minCols: 10,
    // minRows: 10,
    // displayGrid: DisplayGrid.Always
  }
}

export enum FlexItemType {
  FlexLayout,
  Widget
}

export interface FlexLayout {
  key: ID
  type?: FlexItemType
  widgetKey?: ID
  template?: TemplateRef<any>
  templateContext?: any

  direction?: string
  wrap?: string
  styles?: any

  children?: Array<FlexLayout>
}

export const WIDGET_INIT_POSITION = { rows: 3, cols: 4 }

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StorySubscription extends ISubscription {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface StoryNotificationDestination extends INotificationDestination {}

export interface EmulatedDevice {
  name: string
  width: number
  height?: number
  isFold?: boolean
  fold?: {
    width: number
    height: number
  }
}

export type MoveDirection = 'left' | 'right' | 'first' | 'last'