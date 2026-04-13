// import { inject, Injectable } from '@angular/core'
// import { OrganizationBaseCrudService, PaginationParams } from '@xpert-ai/cloud/state'
// import { NGXLogger } from 'ngx-logger'
// import { BehaviorSubject, Observable, switchMap, tap } from 'rxjs'
// import { API_COPILOT_ROLE } from '../constants/app.constants'
// import { ICopilotRole } from '../types'

// @Injectable({ providedIn: 'root' })
// export class CopilotRoleService extends OrganizationBaseCrudService<ICopilotRole> {
//   readonly #logger = inject(NGXLogger)

//   readonly #refresh = new BehaviorSubject<void>(null)

//   constructor() {
//     super(API_COPILOT_ROLE)
//   }

//   create(entity: Partial<ICopilotRole>) {
//     return this.httpClient.post<ICopilotRole>(`${API_COPILOT_ROLE}`, entity).pipe(tap(() => this.refresh()))
//   }

//   update(id: string, entity: Partial<ICopilotRole>) {
//     return this.httpClient.put<ICopilotRole>(`${API_COPILOT_ROLE}/${id}`, entity).pipe(tap(() => this.refresh()))
//   }

//   delete(id: string) {
//     return this.httpClient.delete(`${API_COPILOT_ROLE}/${id}`).pipe(tap(() => this.refresh()))
//   }

//   refresh() {
//     this.#refresh.next()
//   }

//   updateKnowledgebases(roleId: string, knowledgebases: string[]): Observable<ICopilotRole> {
//     return this.httpClient.put<ICopilotRole>(this.apiBaseUrl + '/' + roleId + '/knowledgebases', { knowledgebases })
//   }
// }
