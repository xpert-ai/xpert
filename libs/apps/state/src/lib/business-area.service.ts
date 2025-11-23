import { HttpClient, HttpParams } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import { BusinessAreaRole, IBusinessArea, IBusinessAreaUser } from '@metad/contracts'
import { TreeNodeInterface, hierarchize } from '@metad/ocap-core'
import { Observable } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'
import { C_API_BUSINESS_AREA } from './constants'
import { OrganizationBaseService } from './organization-base.service'


@Injectable({
  providedIn: 'root'
})
export class BusinessAreasService extends OrganizationBaseService {
  readonly httpClient = inject(HttpClient)

  getAll() {
    return super.selectOrganizationId().pipe(
      switchMap((id) => this.httpClient.get<{ items: Array<IBusinessArea> }>(C_API_BUSINESS_AREA).pipe(map(({ items }) => items)))
    )
  }

  getMy(modeler?: boolean) {
    let params = new HttpParams()
    if (modeler) {
      params = params.append('role', BusinessAreaRole.Modeler)
    }
    return super.selectOrganizationId().pipe(
      switchMap((id) => this.httpClient.get<Array<IBusinessArea>>(C_API_BUSINESS_AREA + '/my', {params}))
    )
  }

  getGroupsTree(): Observable<TreeNodeInterface<IBusinessArea>[]> {
    return this.getAll().pipe(
      map((groups) => hierarchizeBusinessAreas(groups) ?? [])
    )
  }

  getMyAreasTree(modeler?: boolean): Observable<TreeNodeInterface<IBusinessArea>[]> {
    return this.getMy(modeler).pipe(
      map((areas) => hierarchizeBusinessAreas(areas) ?? [])
    )
  }

  getById(id: string) {
    return this.httpClient.get<IBusinessArea>(C_API_BUSINESS_AREA + `/${id}`)
  }

  getMeInBusinessArea(id: string) {
    return this.httpClient.get<IBusinessAreaUser>(C_API_BUSINESS_AREA + `/${id}/me`)
  }

  create(input: Partial<IBusinessArea>) {
    return this.httpClient.post<IBusinessArea>(C_API_BUSINESS_AREA, input)
  }

  update(id: string, input: Partial<IBusinessArea>) {
    return this.httpClient.put(C_API_BUSINESS_AREA + `/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(C_API_BUSINESS_AREA + `/${id}`)
  }
}

export function hierarchizeBusinessAreas(areas: IBusinessArea[]) {
  return hierarchize(areas, {
    parentNodeProperty: 'parentId',
    valueProperty: 'id',
    labelProperty: 'name'
  })
}

export function injectBusinessAreaTree() {
  const businessAreaService = inject(BusinessAreasService)
  return businessAreaService.getGroupsTree()
}