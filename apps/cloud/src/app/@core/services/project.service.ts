import { HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import { BehaviorSubject, Subject } from 'rxjs'
import { map, tap } from 'rxjs/operators'
import { IProject } from '../types'

const API_PROJECT = API_PREFIX + '/project'

/**
 * BI Project API Service
 */
@Injectable({ providedIn: 'root' })
export class ProjectAPIService extends OrganizationBaseCrudService<IProject> {
  // private httpClient = inject(HttpClient)
  private refresh$ = new BehaviorSubject<void>(null)
  public deleted$ = new Subject<string>()

  constructor() {
    super(API_PROJECT)
  }

  onRefresh() {
    return this.refresh$.asObservable()
  }

  refresh() {
    this.refresh$.next()
  }

  // getAll() {
  //   return this.httpClient.get<{ items: IProject[] }>(API_PROJECT).pipe(map((result) => result.items))
  // }

  getMy(relations?: string[]) {
    return this.httpClient
      .get<{ items: IProject[] }>(API_PROJECT + `/my`, {
        params: new HttpParams({
          fromObject: {
            $query: JSON.stringify({
              relations
            })
          }
        })
      })
      .pipe(map((result) => result.items))
  }

  create(input: Partial<IProject>) {
    return this.httpClient.post<IProject>(API_PROJECT, input).pipe(tap(() => this.refresh()))
  }

  getOne(id: string, relations?: string[]) {
    return this.httpClient.get<IProject>(API_PROJECT + `/${id}`, {
      params: new HttpParams({
        fromObject: {
          $query: JSON.stringify({
            relations
          })
        }
      })
    })
  }

  update(id: string, input: Partial<IProject>) {
    return this.httpClient.put<IProject>(API_PROJECT + `/${id}`, input)
  }

  updateModels(id: string, models: string[]) {
    return this.httpClient.put<IProject>(API_PROJECT + `/${id}/models`, models)
  }

  deleteModel(id: string, modelId: string) {
    return this.httpClient.delete(API_PROJECT + `/${id}/models/${modelId}`)
  }

  updateMembers(id: string, members: string[]) {
    return this.httpClient.put<IProject>(API_PROJECT + `/${id}/members`, members)
  }

  deleteMember(id: string, memberId: string) {
    return this.httpClient.delete(API_PROJECT + `/${id}/members/${memberId}`)
  }

  updateCertifications(id: string, certifications: string[]) {
    return this.httpClient.put<IProject>(API_PROJECT + `/${id}/certifications`, certifications)
  }

  deleteCertification(id: string, certificationId: string) {
    return this.httpClient.delete(API_PROJECT + `/${id}/certifications/${certificationId}`)
  }

  updateFiles(id: string, files: string[]) {
    return this.httpClient.put<IProject>(API_PROJECT + `/${id}/files`, files)
  }

  removeFile(id: string, fileId: string) {
    return this.httpClient.delete(API_PROJECT + `/${id}/files/${fileId}`)
  }

  delete(id: string) {
    return this.httpClient.delete(API_PROJECT + `/${id}`).pipe(
      tap(() => {
        this.refresh()
        this.deleted$.next(id)
      })
    )
  }
}
