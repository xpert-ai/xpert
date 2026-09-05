import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import type {
  IChatConversation,
  IXpertProject,
  IXpertProjectCreateInput,
  IXpertProjectInvitation,
  IXpertProjectMembership,
  IXpertProjectActivity,
  IXpertProjectAsset,
  IXpertProjectMilestone,
  IXpertProjectAutomation,
  IXpertProjectPlan,
  IXpertProjectSprint,
  IXpertProjectSwimlane,
  IXpertProjectTask,
  IXpertProjectTaskConversation,
  IXpertProjectTaskExecution,
  IPagination,
  IXpert,
  TXpertProjectAccessSummary,
  TXpertProjectInstructions,
  TXpertProjectInvitationInput,
  TXpertProjectInvitationTokenInput,
  TXpertProjectMemberInput,
  TXpertProjectMemberRole,
  TXpertProjectMemberRoleInput,
  TXpertProjectMemberSummary,
  TXpertProjectSkills,
  TXpertProjectSkillSummary,
  TFile,
  TFileDirectory
} from '@xpert-ai/contracts'
import { API_XPERT_PROJECT } from '@cloud/app/@core/constants/app.constants'
import { Subject, tap } from 'rxjs'

export interface XpertProjectOverview {
  project: IXpertProject
  plans: IXpertProjectPlan[] | { items: IXpertProjectPlan[]; total: number }
  tasks: IXpertProjectTask[] | { items: IXpertProjectTask[]; total: number }
  assets: IXpertProjectAsset[] | { items: IXpertProjectAsset[]; total: number }
  assetTotal?: number
  activities: IXpertProjectActivity[] | { items: IXpertProjectActivity[]; total: number }
  automations: IXpertProjectAutomation[] | { items: IXpertProjectAutomation[]; total: number }
}

export type XpertProjectTaskConversationSummary = IXpertProjectTaskConversation & {
  conversation?: {
    id: string
    threadId?: string
    title?: string
    status?: string
    xpertId?: string
  }
}

export interface XpertProjectTaskRelations {
  conversations: XpertProjectTaskConversationSummary[]
  executions: IXpertProjectTaskExecution[]
}

export type XpertProjectConversationTarget = {
  conversationId?: string
  threadId?: string
  xpertId?: string
}

@Injectable({ providedIn: 'root' })
export class XpertProjectApiService {
  readonly #http = inject(HttpClient)
  readonly #projectsChanged = new Subject<void>()
  readonly projectsChanged$ = this.#projectsChanged.asObservable()

  list(params: { search?: string; status?: string; skip?: number; take?: number } = {}) {
    const data = {
      // The workspace owns the status filter, including archived projects.
      // Legacy callers still use the server's active-only default.
      where: params.status ? { status: params.status } : { status: 'all' },
      order: { updatedAt: 'DESC' },
      skip: params.skip ?? 0,
      take: params.take ?? 50
    }
    return this.#http.get<IPagination<IXpertProject>>(`${API_XPERT_PROJECT}/my`, {
      params: new HttpParams().set('data', JSON.stringify(data))
    })
  }

  get(id: string) {
    return this.#http.get<IXpertProject>(`${API_XPERT_PROJECT}/${id}`, {
      params: new HttpParams().set('data', JSON.stringify({ relations: ['owner', 'xperts'] }))
    })
  }

  access(id: string) {
    return this.#http.get<TXpertProjectAccessSummary>(`${API_XPERT_PROJECT}/${id}/access`)
  }

  availableXperts(id: string, options: { skip?: number; take?: number } = {}) {
    return this.#http.get<{ items: IXpert[]; total: number }>(`${API_XPERT_PROJECT}/${id}/available-xperts`, {
      params: {
        skip: options.skip ?? 0,
        take: options.take ?? 100
      }
    })
  }

  availableForXpert(xpertId: string, options: { status?: string; skip?: number; take?: number } = {}) {
    return this.#http.get<IPagination<IXpertProject>>(`${API_XPERT_PROJECT}/available`, {
      params: {
        xpertId,
        status: options.status ?? 'active',
        skip: options.skip ?? 0,
        take: options.take ?? 1
      }
    })
  }

  members(id: string) {
    return this.#http.get<TXpertProjectMemberSummary[]>(`${API_XPERT_PROJECT}/${id}/members`)
  }

  addMember(id: string, input: TXpertProjectMemberInput) {
    return this.#http.post<IXpertProjectMembership>(`${API_XPERT_PROJECT}/${id}/members`, input)
  }

  updateMember(id: string, userId: string, role: TXpertProjectMemberRole) {
    const input: TXpertProjectMemberRoleInput = { role }
    return this.#http.patch<IXpertProjectMembership>(`${API_XPERT_PROJECT}/${id}/members/${userId}`, input)
  }

  removeMember(id: string, userId: string) {
    return this.#http.delete<void>(`${API_XPERT_PROJECT}/${id}/members/${userId}`)
  }

  transferOwnership(id: string, userId: string) {
    return this.#http.patch<IXpertProject>(`${API_XPERT_PROJECT}/${id}/owner`, { userId })
  }

  invitations(id: string) {
    return this.#http.get<IXpertProjectInvitation[]>(`${API_XPERT_PROJECT}/${id}/invitations`)
  }

  invite(id: string, input: TXpertProjectInvitationInput) {
    return this.#http.post<IXpertProjectInvitation>(`${API_XPERT_PROJECT}/${id}/invitations`, input)
  }

  revokeInvitation(id: string, invitationId: string) {
    return this.#http.delete<void>(`${API_XPERT_PROJECT}/${id}/invitations/${invitationId}`)
  }

  acceptInvitation(token: string) {
    const input: TXpertProjectInvitationTokenInput = { token }
    return this.#http
      .post<IXpertProjectMembership>(`${API_XPERT_PROJECT}/invitations/accept`, input)
      .pipe(tap(() => this.#projectsChanged.next()))
  }

  declineInvitation(token: string) {
    const input: TXpertProjectInvitationTokenInput = { token }
    return this.#http.post<IXpertProjectInvitation>(`${API_XPERT_PROJECT}/invitations/decline`, input)
  }

  instructions(id: string) {
    return this.#http.get<TXpertProjectInstructions>(`${API_XPERT_PROJECT}/${id}/content/instructions`)
  }

  updateInstructions(id: string, content: string) {
    const input: TXpertProjectInstructions = { content }
    return this.#http.put<TXpertProjectInstructions>(`${API_XPERT_PROJECT}/${id}/content/instructions`, input)
  }

  skills(id: string) {
    return this.#http.get<TXpertProjectSkills>(`${API_XPERT_PROJECT}/${id}/content/skills`)
  }

  installSkill(id: string, indexId: string) {
    return this.#http.post<TXpertProjectSkillSummary>(`${API_XPERT_PROJECT}/${id}/content/skills/install`, {
      indexId
    })
  }

  uploadSkills(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return this.#http.post<TXpertProjectSkillSummary[]>(`${API_XPERT_PROJECT}/${id}/content/skills/upload`, form)
  }

  setSkillEnabled(id: string, skillId: string, enabled: boolean) {
    return this.#http.patch<TXpertProjectSkillSummary>(`${API_XPERT_PROJECT}/${id}/content/skills`, {
      skillId,
      enabled
    })
  }

  uninstallSkill(id: string, skillId: string) {
    return this.#http.delete<void>(`${API_XPERT_PROJECT}/${id}/content/skills`, { params: { skillId } })
  }

  overview(id: string) {
    return this.#http.get<XpertProjectOverview>(`${API_XPERT_PROJECT}/overview`, {
      params: new HttpParams().set('projectId', id)
    })
  }

  create(input: IXpertProjectCreateInput) {
    return this.#http.post<IXpertProject>(API_XPERT_PROJECT, input).pipe(tap(() => this.#projectsChanged.next()))
  }

  importDsl(input: unknown) {
    return this.#http
      .post<IXpertProject>(`${API_XPERT_PROJECT}/import`, input)
      .pipe(tap(() => this.#projectsChanged.next()))
  }

  update(id: string, input: Partial<IXpertProject>) {
    return this.#http
      .put<IXpertProject>(`${API_XPERT_PROJECT}/${id}`, input)
      .pipe(tap(() => this.#projectsChanged.next()))
  }

  bindWorkspace(id: string, workspaceId: string) {
    return this.#http.put<IXpertProject>(`${API_XPERT_PROJECT}/${id}/workspace`, { workspaceId })
  }

  addXpert(id: string, xpertId: string) {
    return this.#http.put<IXpertProject>(`${API_XPERT_PROJECT}/${id}/xperts/${xpertId}`, {})
  }

  setAssistant(id: string, xpertId: string) {
    return this.#http.put<IXpertProject>(`${API_XPERT_PROJECT}/${id}/assistant`, { xpertId })
  }

  removeXpert(id: string, xpertId: string) {
    return this.#http.delete<IXpertProject>(`${API_XPERT_PROJECT}/${id}/xperts/${xpertId}`)
  }

  archive(id: string) {
    return this.#http
      .post<IXpertProject>(`${API_XPERT_PROJECT}/${id}/archive`, {})
      .pipe(tap(() => this.#projectsChanged.next()))
  }

  plans(id: string) {
    return this.#http.get<IXpertProjectPlan[]>(`${API_XPERT_PROJECT}/${id}/plans`)
  }

  tasks(id: string) {
    return this.#http.get<IXpertProjectTask[]>(`${API_XPERT_PROJECT}/${id}/tasks`)
  }

  assets(
    id: string,
    options: { parentId?: string; kind?: IXpertProjectAsset['kind']; skip?: number; take?: number } = {}
  ) {
    let params = new HttpParams()
    if (options.parentId) params = params.set('parentId', options.parentId)
    if (options.kind) params = params.set('kind', options.kind)
    params = params.set('skip', options.skip ?? 0).set('take', options.take ?? 100)
    return this.#http.get<{ items: IXpertProjectAsset[]; total: number }>(`${API_XPERT_PROJECT}/${id}/assets`, {
      params
    })
  }

  workspaceFiles(id: string, path = '') {
    return this.#http.get<TFileDirectory[]>(`${API_XPERT_PROJECT}/${id}/workspace/files`, {
      params: { path }
    })
  }

  workspaceFile(id: string, path: string) {
    return this.#http.get<TFile>(`${API_XPERT_PROJECT}/${id}/workspace/file`, { params: { path } })
  }

  saveWorkspaceFile(id: string, path: string, content: string) {
    return this.#http.put<TFile>(`${API_XPERT_PROJECT}/${id}/workspace/file`, { path, content })
  }

  uploadWorkspaceFile(id: string, file: File, path = '') {
    const form = new FormData()
    form.append('file', file)
    form.append('path', path)
    return this.#http.post<TFile>(`${API_XPERT_PROJECT}/${id}/workspace/file/upload`, form)
  }

  deleteWorkspaceFile(id: string, path: string) {
    return this.#http.delete<void>(`${API_XPERT_PROJECT}/${id}/workspace/file`, { params: { path } })
  }

  activities(id: string) {
    return this.#http.get<IPagination<IXpertProjectActivity>>(`${API_XPERT_PROJECT}/${id}/activities`)
  }

  automations(id: string) {
    return this.#http.get<IXpertProjectAutomation[]>(`${API_XPERT_PROJECT}/${id}/automations`)
  }

  conversations(id: string) {
    return this.#http.get<{ items: IChatConversation[]; total: number }>(`${API_XPERT_PROJECT}/${id}/conversations`)
  }

  createPlan(id: string, input: Partial<IXpertProjectPlan>) {
    return this.#http.post<IXpertProjectPlan>(`${API_XPERT_PROJECT}/${id}/plans`, input)
  }

  updatePlan(id: string, planId: string, input: Partial<IXpertProjectPlan>) {
    return this.#http.put<IXpertProjectPlan>(`${API_XPERT_PROJECT}/${id}/plans/${planId}`, input)
  }

  createMilestone(id: string, planId: string, input: Partial<IXpertProjectMilestone>) {
    return this.#http.post<IXpertProjectMilestone>(`${API_XPERT_PROJECT}/${id}/plans/${planId}/milestones`, input)
  }

  updateMilestone(id: string, planId: string, milestoneId: string, input: Partial<IXpertProjectMilestone>) {
    return this.#http.put<IXpertProjectMilestone>(
      `${API_XPERT_PROJECT}/${id}/plans/${planId}/milestones/${milestoneId}`,
      input
    )
  }

  createTask(id: string, input: Partial<IXpertProjectTask>) {
    return this.#http.post<IXpertProjectTask>(`${API_XPERT_PROJECT}/${id}/tasks`, input)
  }

  updateTask(id: string, taskId: string, input: Partial<IXpertProjectTask>) {
    return this.#http.put<IXpertProjectTask>(`${API_XPERT_PROJECT}/${id}/tasks/${taskId}`, input)
  }

  reorderTasks(id: string, items: Array<{ id: string; order: number; column?: string }>) {
    return this.#http.put<IXpertProjectTask[]>(`${API_XPERT_PROJECT}/${id}/tasks/order`, items)
  }

  taskRelations(id: string, taskId: string) {
    return this.#http.get<XpertProjectTaskRelations>(`${API_XPERT_PROJECT}/${id}/tasks/${taskId}/relations`)
  }

  linkTaskConversation(
    id: string,
    taskId: string,
    input: { conversationId: string; relationType: string; isPrimary?: boolean }
  ) {
    return this.#http.post(`${API_XPERT_PROJECT}/${id}/tasks/${taskId}/conversations`, input)
  }

  createTaskExecution(id: string, taskId: string, input: Record<string, unknown>) {
    return this.#http.post(`${API_XPERT_PROJECT}/${id}/tasks/${taskId}/executions`, input)
  }

  updateTaskExecution(id: string, taskId: string, executionId: string, input: Record<string, unknown>) {
    return this.#http.put(`${API_XPERT_PROJECT}/${id}/tasks/${taskId}/executions/${executionId}`, input)
  }

  createSprint(id: string, planId: string, input: Partial<IXpertProjectSprint>) {
    return this.#http.post<IXpertProjectSprint>(`${API_XPERT_PROJECT}/${id}/plans/${planId}/sprints`, input)
  }

  updateSprint(id: string, sprintId: string, input: Record<string, unknown>) {
    return this.#http.put(`${API_XPERT_PROJECT}/${id}/sprints/${sprintId}`, input)
  }

  swimlanes(id: string, sprintId: string) {
    return this.#http.get<IXpertProjectSwimlane[]>(`${API_XPERT_PROJECT}/${id}/sprints/${sprintId}/swimlanes`)
  }

  createAsset(id: string, input: Partial<IXpertProjectAsset>) {
    return this.#http.post<IXpertProjectAsset>(`${API_XPERT_PROJECT}/${id}/assets`, input)
  }

  updateAutomation(id: string, automationId: string, input: Partial<IXpertProjectAutomation>) {
    return this.#http.put<IXpertProjectAutomation>(`${API_XPERT_PROJECT}/${id}/automations/${automationId}`, input)
  }

  createAutomation(id: string, input: Partial<IXpertProjectAutomation>) {
    return this.#http.post<IXpertProjectAutomation>(`${API_XPERT_PROJECT}/${id}/automations`, input)
  }

  uploadFile(id: string, file: File) {
    const form = new FormData()
    form.append('file', file)
    return this.#http.post<{ url: string; asset: IXpertProjectAsset }>(`${API_XPERT_PROJECT}/${id}/file/upload`, form)
  }
}
