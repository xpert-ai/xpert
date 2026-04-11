import { ISemanticModel } from '@xpert-ai/contracts'
import { AgentType, DataSourceOptions, isEmpty, isNil, nonNullable, Syntax } from '@xpert-ai/ocap-core'
import { combineLatest, firstValueFrom, tap } from 'rxjs'
import { NxStoryStore } from './story-store.service'
import { ComponentStyling, StoryModel } from './types'

export function getSemanticModelKey(model: StoryModel | ISemanticModel) {
  return model?.key ?? model?.name
}

/**
 * @deprecated use registerModel
 */
export function convertStoryModel2DataSource(model: StoryModel): DataSourceOptions {
  const dialect = model.dataSource?.type?.type === 'agent' ? 'sqlite' : model.dataSource?.type?.type

  const dataSource = {
    ...model,
    name: getSemanticModelKey(model),
    caption: model.name,
    /**
     * @todo 提前至模型创建时 ?
     */
    syntax: model.syntax || (model.type === 'XMLA' ? Syntax.MDX : Syntax.SQL),
    dialect,
    schema: {
      ...(model.schema ?? {}),
      indicators: model.indicators,
      entitySets: {
        ...(model.schema?.entitySets ?? {})
      }
    }
  }

  dataSource.settings = dataSource.settings ?? {
    ignoreUnknownProperty: true
  }
  dataSource.settings.dataSourceId = model.dataSourceId
  // TODO 使用更好的方式
  if (model.dataSource?.useLocalAgent) {
    dataSource.agentType = AgentType.Local
  }
  dataSource.agentType = dataSource.agentType ?? AgentType.Server

  if (dataSource.agentType === AgentType.Wasm) {
    dataSource.catalog = dataSource.catalog ?? 'main'
    dataSource.dialect = 'duckdb'
  }

  if (model.type === 'XMLA' && model.dataSource?.type?.protocol?.toLowerCase() === 'sql') {
    dataSource.catalog = model.name
  }

  if (model.type === 'XMLA') {
    ;(dataSource.settings as any).dataSourceInfo = model.dataSource?.options?.['data_source_info'] as string
  }

  return dataSource as DataSourceOptions
}

/**
 * @deprecated
 */
export function convertXMLAModel2DataSource(model: StoryModel) {
  return {
    type: 'XMLA',
    syntax: Syntax.MDX,
    settings: {
      dataSourceId: model.dataSourceId,
      catalog: model.catalog,
      dataSourceInfo: model.id // model.settings?.dataSourceInfo,
    }
  }
}

export async function fetchStory(storyStore: NxStoryStore, id: string) {
  const story = await firstValueFrom(storyStore.getStory(id))
  if (!isEmpty(story.points)) {
    await firstValueFrom(
      combineLatest(
        story.points.map((point) => {
          return storyStore.getStoryPoint(story.id, point.id).pipe(tap((result) => (point.widgets = result.widgets)))
        })
      )
    )
  }

  return story
}

export async function downloadJson(myJson: any, fileName: string) {
  const sJson = JSON.stringify(myJson)
  const element = document.createElement('a')
  element.setAttribute('href', 'data:text/json;charset=UTF-8,' + encodeURIComponent(sJson))
  element.setAttribute('download', `${fileName}.json`)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click() // simulate click
  document.body.removeChild(element)
}

export function componentStyling(styling: ComponentStyling) {
  if (!styling) return {}

  const componentStyles: any = {
    backgroundColor: `${styling.backgroundColor ?? ''}`
  }

  if (!isNil(styling.padding)) {
    componentStyles.padding = `${styling.padding}px`
  }

  if (!isNil(styling.borderRadius)) {
    componentStyles.borderRadius = `${styling.borderRadius}px`
  }

  if (styling.backgroundImageObj) {
    componentStyles.backgroundImage = `url(${styling.backgroundImageObj?.url ?? ''})`
  } else if(styling.backgroundImage) {
    componentStyles.backgroundImage = styling.backgroundImage
  }
  if (styling.background) {
    componentStyles.background = styling.background
  }
  if (componentStyles.backgroundImage) {
    componentStyles.backgroundSize = styling.backgroundSize ?? 'cover'
    componentStyles.backgroundRepeat = styling.backgroundRepeat ?? 'repeat'
  }
  if (styling.backdropFilter) {
    componentStyles.backdropFilter = styling.backdropFilter
  }

  if (styling.borderColor) {
    componentStyles.border = `${styling.borderWidth ?? 1}px ${styling.borderStyle || 'solid'} ${styling.borderColor}`
  }

  if (styling.borderImageObj) {
    componentStyles.borderImage = `url(${styling.borderImageObj?.url ?? ''}) ${
      styling.borderImageSlice ?? 1
    } stretch`
  }

  if (styling.shadowColor) {
    componentStyles.boxShadow = `${styling.shadowOffsetX ?? 0}px ${styling.shadowOffsetY ?? 0}px ${
      styling.shadowBlur ?? 0
    }px ${styling.shadowSpread ?? 0}px ${styling.shadowColor}`
  } else if (styling.boxShadow) {
    componentStyles.boxShadow = styling.boxShadow
  }

  if (styling.color) {
    componentStyles.color = styling.color
  }
  
  componentStyles.fontFamily = styling.fontFamily ?? 'inherit'
  componentStyles.fontSize = (styling.fontSize && `${styling.fontSize}px`) || 'inherit'
  componentStyles.lineHeight = styling.lineHeight || null
  componentStyles.fontWeight = styling.fontWeight ?? 'inherit'
  if (styling.textAlign) {
    componentStyles.textAlign = styling.textAlign
  }
  if (styling.textShadow) {
    componentStyles.textShadow = styling.textShadow
  }

  // transform
  if (styling.transform) {
    componentStyles.transform = styling.transform
  }
  if (styling.transformOrigin) {
    componentStyles.transformOrigin = styling.transformOrigin
  }

  if (styling.filter) {
    componentStyles.filter = styling.filter
  }
  if (nonNullable(styling.opacity)) {
    componentStyles.opacity = styling.opacity
  }

  return componentStyles
}
