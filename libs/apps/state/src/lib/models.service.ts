/* eslint-disable @typescript-eslint/member-ordering */
import { HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { hierarchize, Indicator, omit, pick, SemanticModel as OcapSemanticModel, Cube } from '@metad/ocap-core'
import { StoryModel } from '@metad/story/core'
import { Observable, zip } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { BusinessAreasService } from './business-area.service'
import { C_URI_API_MODELS, C_URI_API_MODEL_MEMBERS } from './constants'
import { convertIndicatorResult, convertStoryModel, timeRangeToParams } from './types'
import { IDataSource, ISemanticModel, ISemanticModelQueryLog, TSemanticModelDraft } from './types'
import { OrganizationBaseCrudService } from './organization-base-crud.service'
import { PaginationParams, toHttpParams } from './crud.service'

@Injectable({
  providedIn: 'root'
})
export class SemanticModelServerService extends OrganizationBaseCrudService<ISemanticModel> {
  
  readonly businessAreaService = inject(BusinessAreasService)

  constructor() {
    super(C_URI_API_MODELS)
  }

  saveDraft(id: string, draft: TSemanticModelDraft) {
    return this.httpClient.post<TSemanticModelDraft>(this.apiBaseUrl + `/${id}/draft`, draft)
  }

  publish(id: string, releaseNotes: string) {
    return this.httpClient.post(this.apiBaseUrl + `/${id}/publish`, {releaseNotes})
  }

  getModels(path: string, query?) {
    let params = new HttpParams().append(
      '$query',
      JSON.stringify({
        relations: ['createdBy', 'updatedBy', 'dataSource', 'dataSource.type', 'businessArea'],
        order: {
          updatedAt: 'DESC'
        }
      })
    )

    if (query) {
      params = params.appendAll(query)
    }

    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient
          .get<{ items: Array<ISemanticModel> }>(C_URI_API_MODELS + path, {
            params
          })
          .pipe(map(({ items }) => items.map(convertNewSemanticModelResult)))
      )
    )
  }

  getAll() {
    return this.getModels('') as Observable<any>
  }

  /**
   * @deprecated use getMyModels
   * 
   * @param businessAreaId 
   * @returns 
   */
  getMy(businessAreaId?: string) {
    return this.getModels('/my', businessAreaId ? { businessAreaId } : null)
  }

  getMyModels(options?: PaginationParams<ISemanticModel>) {
    const params = new HttpParams().append(
      '$query',
      JSON.stringify(options ?? {})
    )
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient
          .get<{ items: Array<ISemanticModel> }>(C_URI_API_MODELS + `/my`, {params})
          .pipe(map(({ items }) => items.map(convertNewSemanticModelResult)))
      )
    )
  }

  getMyModelsByAreaTree() {
    return zip([this.businessAreaService.getMy(true), this.getMy()]).pipe(
      map(([areas, models]) => {
        return (
          hierarchize(
            [
              ...models.map((item) => ({
                ...item,
                parentId: item.businessAreaId,
                dataSource: item.dataSource?.name,
                __isModel__: true
              })),
              ...areas
            ],
            {
              parentNodeProperty: 'parentId',
              valueProperty: 'id',
              labelProperty: 'name'
            }
          ) ?? []
        )
      })
    )
  }

  getModelsByAreaTree() {
    return zip([this.businessAreaService.getAll(), this.getAll()]).pipe(
      map(([areas, models]) => {
        return (
          hierarchize(
            [
              ...models.map((item) => ({
                ...item,
                parentId: item.businessAreaId,
                dataSource: item.dataSource?.name
              })),
              ...areas
            ],
            {
              parentNodeProperty: 'parentId',
              valueProperty: 'id',
              labelProperty: 'name'
            }
          ) ?? []
        )
      })
    )
  }

  getByGroup(groupId?: string) {
    const findInput = {}
    if (groupId) {
      findInput['groupId'] = groupId
    }

    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient
          .get<{ items: Array<ISemanticModel> }>(C_URI_API_MODELS, {
            params: new HttpParams().append(
              '$query',
              JSON.stringify({
                relations: ['createdBy', 'updatedBy', 'dataSource', 'dataSource.type', 'group'],
                findInput
              })
            )
          })
          .pipe(map(({ items }) => items.map(convertNewSemanticModelResult)))
      )
    )
  }

  upload(data: ISemanticModel) {
    return this.httpClient.post(C_URI_API_MODELS, data)
  }

  create(data: Partial<StoryModel>) {
    return this.httpClient.post<ISemanticModel>(C_URI_API_MODELS, convertStoryModel(data))
  }

  createNew(data: Partial<NgmSemanticModel>) {
    return this.httpClient.post(C_URI_API_MODELS, convertNewSemanticModel(data))
  }

  update(id: string, input: Partial<ISemanticModel>, options?: { relations: string[] }) {
    let params = new HttpParams()
    if (options?.relations) {
      params = params.append('relations', options.relations.join(','))
    }
    return this.httpClient.put<ISemanticModel>(C_URI_API_MODELS + `/${id}`, convertNewSemanticModel(input), { params })
  }

  updateModel(id: string, input: Partial<ISemanticModel>) {
    return this.httpClient.put<ISemanticModel>(C_URI_API_MODELS + `/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_URI_API_MODELS}/${id}`)
  }

  getById(id: string, options?: {select?: (keyof ISemanticModel)[]; relations?: string[]}) {
    const { relations } = options ?? {}
    return this.httpClient.get<ISemanticModel>(this.apiBaseUrl + `/${id}`, {
      params: new HttpParams().append(
        '$query',
        JSON.stringify({
          relations: relations ?? []
        })
      )
    })
  }

  getCubes(id: string) {
    return this.httpClient.get<Cube[]>(this.apiBaseUrl + `/${id}/cubes`)
  }

  count() {
    return this.httpClient.get<number>(C_URI_API_MODELS + `/count`)
  }

  createRole(modelId: string, name: string) {
    return this.httpClient.post(`${C_URI_API_MODELS}/${modelId}/role`, { name })
  }

  deleteCache(id: string) {
    return this.httpClient.delete(`${C_URI_API_MODELS}/${id}/cache`)
  }

  updateMembers(id: string, members: string[]) {
    return this.httpClient.put<ISemanticModel>(C_URI_API_MODELS + `/${id}/members`, members)
  }

  deleteMember(id: string, memberId: string) {
    return this.httpClient.delete(C_URI_API_MODELS + `/${id}/members/${memberId}`)
  }

  updateOwner(id: string, userId: string, params?) {
    return this.httpClient.put<ISemanticModel>(C_URI_API_MODELS + `/${id}`, {ownerId: userId}, { params })
  }

  uploadDimensionMembers(id: string, body: Record<string, string[]>) {
    return this.httpClient.post(C_URI_API_MODEL_MEMBERS + `/${id}`, body)
  }

  getRelevantMembers(modelId: string, cube: string, query: string, k = 10) {
    return this.httpClient.post<any[]>(C_URI_API_MODEL_MEMBERS + `/${modelId}/retrieve`, { cube, query, k })
  }

  getLogs(id: string, options: PaginationParams<ISemanticModelQueryLog>, timeRange: string[]) {
    const params = toHttpParams(options)
    return this.httpClient.get<{items: ISemanticModelQueryLog[]; total: number;}>(C_URI_API_MODELS + `/${id}/logs`, {
      params: timeRangeToParams(params, timeRange)
    })
  }

  /*
  |--------------------------------------------------------------------------
  | Public API
  |--------------------------------------------------------------------------
  */

  getPublicOne(id: string, options?: {select?: (keyof ISemanticModel)[]; relations?: string[]}): Observable<ISemanticModel> {
    const { relations } = options ?? {}
    return this.httpClient.get<ISemanticModel>(this.apiBaseUrl + `/public/${id}`, {
      params: new HttpParams().append(
        '$query',
        JSON.stringify({
          relations: relations ?? []
        })
      )
    })
  }
}

/**
 * @deprecated 需重构, 找到更好的转换方式
 */
export function convertNewSemanticModel(model: Partial<OcapSemanticModel | ISemanticModel>): ISemanticModel {
  const systemFields = [
    'key',
    'name',
    'description', 
    'type',
    'catalog',
    'cube',
    'dataSourceId',
    'businessAreaId',
    'preferences',
    'visibility',
    'roles',
    'ownerId',
    'status'
  ]
  const updateModel: ISemanticModel = {
    options: omit(model, ...[
      ...systemFields,
      'options',
      'id',
      'tenantId',
      'tenant',
      'organizationId',
      'organization',
      'businessArea',
      'dataSource',
      'stories',
      'indicators',
      'createdAt',
      'updatedAt',
      'createdById',
      'createdBy',
      'updatedById',
      'updatedBy',
      'queries'
    ]),
    ...pick(model, ...systemFields)
  }

  return updateModel
}

/**
 * @deprecated 需重构, 找到更好的转换方式
 */
export interface NgmSemanticModel extends OcapSemanticModel, Pick<ISemanticModel, 'cube'>, Pick<ISemanticModel, 'roles'>,  Pick<ISemanticModel, 'queries'> {
  key?: string
  preferences?: any
  dataSource?: IDataSource
  businessAreaId?: string
  indicators?: Indicator[]
  draft?: TSemanticModelDraft
  isDraft: boolean
}

/**
 * @deprecated 需重构, 找到更好的转换方式
 */
export function convertNewSemanticModelResult(result: ISemanticModel): NgmSemanticModel & Omit<ISemanticModel, 'indicators'> {
  return {
    ...result.options,
    ...omit(result, 'options'),
    indicators: result.indicators?.map(convertIndicatorResult)
  } as NgmSemanticModel & Omit<ISemanticModel, 'indicators'>
}
