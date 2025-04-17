/* eslint-disable @typescript-eslint/member-ordering */
import { IDataSource, IIndicator, ISemanticModel, IStory, IStoryWidget, IndicatorOptionFields } from '@metad/contracts'
import { Indicator as OCAPIndicator, SemanticModel, isNil, omit, omitBy, pick } from '@metad/ocap-core'
import { Story, StoryConnection, StoryModel, StoryPoint, StoryWidget, uuid } from '@metad/story/core'
import { HttpParams } from '@angular/common/http'
export * from '@metad/contracts'
import { convertNewSemanticModelResult } from './models.service'


export const SystemPrivacyFields = [
  'createdById',
  'createdBy',
  'updatedById',
  'updatedBy',
  'createdAt',
  'updatedAt',
  'tenantId',
  'tenant',
  'organizationId',
  'organization',
  'visibility'
]

const SYSTEM_FIELDS = ['id', 'name', ...SystemPrivacyFields]

export interface Indicator extends Partial<OCAPIndicator>, Omit<IIndicator, 'type'> {
  //
}

/**
 * @deprecated 是否还在用?
 */
export function convertConnectionResult(result: IDataSource): StoryConnection {
  const connection: StoryConnection = result as StoryConnection

  // TODO 非本地代理先这样处理, 后续改成 HttpAgent 服务统一处理
  if (!result.useLocalAgent) {
    connection.options = {
      dataSourceInfo: result.options?.data_source_info,
      dialect: result.options?.dialect
    }
  }
  return connection
}

export function convertStoryModel(model: Partial<StoryModel>): ISemanticModel {
  const updateModel: ISemanticModel = {
    name: model.name,
    key: model.key,
    type: model.type,
    businessAreaId: model.businessAreaId,
    catalog: model.catalog,
    cube: model.cube,
    dataSourceId: model.dataSourceId,
    preferences: model.preferences
  }

  if (model.schema) {
    updateModel.options = pick(model, 'settings', 'schema') as any
  }

  return updateModel
}

/**
 * @deprecated use convertNewSemanticModelResult
 *
 * @param result
 * @returns
 */
export function convertStoryModelResult1(result: ISemanticModel): StoryModel {
  return {
    ...result.options,
    ...result,
    type: result.type as SemanticModel['type'],
    dataSource: result.dataSource as StoryConnection,
    indicators: result.indicators?.map(convertIndicatorResult),
    isDraft: false
  }
}

export function convertStory(story: Partial<Story>): Partial<Story> {
  return omitBy(
    {
      name: story.name,
      description: story.description,
      modelId: story.model?.id ?? story.modelId,
      projectId: story.projectId,
      collectionId: story.collectionId,
      businessAreaId: story.businessAreaId,
      previewId: story.previewId,
      thumbnail: story.thumbnail,
      status: story.status,
      templateId: story.templateId,
      // 服务端暂不支持级联更新多对多表
      models: story.models?.map((item) => ({id: item.id})),
      points: story.points?.map(convertStoryPoint),
      options: pick(story, 'title', 'filterBar', 'options', 'schema', 'schemas')
    },
    isNil
  )
}

export function convertStoryResult(result: Partial<IStory>): Story {
  return {
    ...result.options,
    ...omit(result, 'options'),
    options: result.options?.options,
    model: (result.model ? convertNewSemanticModelResult(result.model) : null) as StoryModel,
    models: result.models?.map(convertNewSemanticModelResult),
    points: result.points?.map(convertStoryPointResult)
  }
}

export function convertStoryPoint(storyPoint: StoryPoint) {
  return omitBy(
    {
      ...pick(storyPoint, 'key', 'storyId', 'name'),
      options: omit(storyPoint, 'storyId', 'widgets', ...SYSTEM_FIELDS),
      widgets: storyPoint.widgets?.map(convertStoryWidget)
    },
    isNil
  )
}

export function convertStoryWidget(widget: StoryWidget): IStoryWidget {
  return {
    ...pick(widget, 'key', 'storyId', 'pointId', 'name'),
    options: omit(widget, 'storyId', 'pointId', 'key', ...SYSTEM_FIELDS)
  } as IStoryWidget
}

export function convertStoryPointResult(result) {
  const widgets = result.widgets?.map((item) => convertStoryWidgetResult(item))
  return {
    ...result.options,
    ...omit(result, 'options'),
    key: result.key ?? result.options?.key ?? uuid(), // Backward compatibility
    id: result.id,
    name: result.name,
    storyId: result.storyId,
    widgets
  }
}

export function convertStoryWidgetResult(result: IStoryWidget): StoryWidget {
  return {
    ...result.options,
    ...omit(result, 'options', ...SystemPrivacyFields),
    id: result.id,
    key: result.key ?? result.options?.key ?? uuid(), // Backward compatibility
    name: result.name,
    storyId: result.storyId,
    pointId: result.pointId,
    point: result.point ? convertStoryPointResult(result.point) : result.point
  } as StoryWidget
}

export function convertIndicator(input: Partial<Indicator>) {
  return {
    ...omit(input, ...IndicatorOptionFields),
    options: pick(input, ...IndicatorOptionFields)
  }
}

export function convertIndicatorResult(result: IIndicator): any {
  return {
    ...omit(result, 'options'),
    description: result.business,
    ...(result.options ?? {})
  } as any
}

export function timeRangeToParams(params: HttpParams, timeRange: string[]) {
  if (timeRange[0]) {
    params = params.set('start', timeRange[0])
  }
  if (timeRange[1]) {
    params = params.set('end', timeRange[1])
  }
  return params
}