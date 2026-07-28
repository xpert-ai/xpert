import { HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IDataSource, IIndicator, ISemanticModel, TSemanticModelDraft } from '@xpert-ai/contracts'
import { omit } from 'lodash-es'
import { Observable } from 'rxjs'
import { C_URI_API_MODELS } from './constants'
import { OrganizationBaseCrudService } from './organization-base-crud.service'

export type RuntimeIndicator = Omit<IIndicator, 'type'> & {
  type?: string
  [key: string]: unknown
}

export type NgmSemanticModel = Partial<TSemanticModelDraft> &
  Pick<ISemanticModel, 'cube' | 'roles'> & {
    key?: string
    preferences?: ISemanticModel['preferences']
    dataSource?: IDataSource
    indicators?: RuntimeIndicator[]
  }

/**
 * Minimal compatibility adapter for the existing Xpert live-artifact renderer.
 * Data/BI authoring and management APIs live in Data Xpert.
 */
@Injectable({ providedIn: 'root' })
export class SemanticModelServerService extends OrganizationBaseCrudService<ISemanticModel> {
  constructor() {
    super(C_URI_API_MODELS)
  }

  getById(id: string, options?: { select?: (keyof ISemanticModel)[]; relations?: string[] }) {
    return this.httpClient.get<ISemanticModel>(this.apiBaseUrl + `/${id}`, {
      params: semanticModelRelationsParams(options?.relations)
    })
  }

  getPublicOne(
    id: string,
    options?: { select?: (keyof ISemanticModel)[]; relations?: string[] }
  ): Observable<ISemanticModel> {
    return this.httpClient.get<ISemanticModel>(this.apiBaseUrl + `/public/${id}`, {
      params: semanticModelRelationsParams(options?.relations)
    })
  }
}

export function convertNewSemanticModelResult(
  result: ISemanticModel
): NgmSemanticModel & Omit<ISemanticModel, 'indicators'> {
  return {
    ...result.options,
    ...omit(result, 'options'),
    indicators: result.indicators?.map(convertIndicatorResult)
  } as NgmSemanticModel & Omit<ISemanticModel, 'indicators'>
}

function convertIndicatorResult(result: IIndicator): RuntimeIndicator {
  return {
    ...omit(result, 'options'),
    description: result.business,
    ...(result.options ?? {})
  } as RuntimeIndicator
}

function semanticModelRelationsParams(relations?: string[]) {
  return new HttpParams().append(
    '$query',
    JSON.stringify({
      relations: relations ?? []
    })
  )
}
