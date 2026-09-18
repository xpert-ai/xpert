import { HttpErrorResponse } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { OrganizationBaseCrudService } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, catchError, throwError } from 'rxjs'
import { API_XPERT_TOOL } from '../constants/app.constants'
import { IXpertTool } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertToolService extends OrganizationBaseCrudService<IXpertTool> {
  readonly #logger = inject(NGXLogger)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_XPERT_TOOL)
  }

  test(tool: IXpertTool) {
    return this.httpClient
      .post(this.apiBaseUrl + `/test`, tool, { responseType: 'text' })
      .pipe(catchError((error: unknown) => throwError(() => normalizeToolTestError(error))))
  }

  getParamsFaker(id: string) {
    return this.httpClient.get<Record<string, any>>(this.apiBaseUrl + `/${id}/faker`)
  }
}

function normalizeToolTestError(error: unknown): unknown {
  if (!(error instanceof HttpErrorResponse) || typeof error.error !== 'string') return error

  let body: unknown
  try {
    body = JSON.parse(error.error)
  } catch {
    return error
  }
  if (!body || typeof body !== 'object' || !('message' in body) || typeof body.message !== 'string') return error

  return new HttpErrorResponse({
    error: body,
    headers: error.headers,
    status: error.status,
    statusText: error.statusText,
    url: error.url ?? undefined
  })
}
