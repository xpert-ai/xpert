import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, IXpertTask, resolveI18nText } from '@xpert-ai/contracts'
import { EMPTY, Observable, expand, forkJoin, map, of, reduce, take } from 'rxjs'
import { ChatConversationService } from './chat-conversation.service'
import { CopilotServerService } from './copilot-server.service'
import { XpertMarketplaceService } from './xpert-marketplace.service'
import { XpertTaskService } from './xpert-task.service'
import { PluginAPIService } from '../state/plugin.service'
import { API_PREFIX } from '../state/constants'
import { McpPublicationService } from './mcp-publication.service'
import { McpRuntimeService } from './mcp-runtime.service'
import { XpertProjectApiService } from '../../features/project/project-api.service'
import { AgentEvolutionApiService } from '../../features/agent-evolution/agent-evolution-api.service'
import {
  BindingSummary,
  PackageSummary,
  groupPluginPackages
} from '../../features/setting/plugins/agent-plugins/agent-plugins.model'
import { pluginMarketplaceDetailCommands } from '../../features/setting/plugins/marketplace/plugin-marketplace-navigation'
import {
  matchesSidebarSearch,
  searchPage,
  SIDEBAR_SEARCH_PAGE_SIZE,
  SidebarSearchContext,
  SidebarSearchPage,
  SidebarSearchResult,
  SidebarSearchSource
} from '../../features/sidebar/search/sidebar-search.types'

@Injectable({ providedIn: 'root' })
export class SidebarSearchService {
  private readonly http = inject(HttpClient)
  private readonly conversations = inject(ChatConversationService)
  private readonly tasks = inject(XpertTaskService)
  private readonly projects = inject(XpertProjectApiService)
  private readonly plugins = inject(PluginAPIService)
  private readonly models = inject(CopilotServerService)
  private readonly publications = inject(McpPublicationService)
  private readonly runtimes = inject(McpRuntimeService)
  private readonly evolution = inject(AgentEvolutionApiService)
  private readonly approvals = inject(XpertMarketplaceService)
  private readonly translate = inject(TranslateService)

  search(
    source: SidebarSearchSource,
    query: string,
    offset: number,
    context: SidebarSearchContext
  ): Observable<SidebarSearchPage> {
    const page = { search: query, page: offset / SIDEBAR_SEARCH_PAGE_SIZE + 1, pageSize: SIDEBAR_SEARCH_PAGE_SIZE }
    switch (source) {
      case 'automations': {
        const fetchPage = (offset: number) =>
          this.tasks.getMyAll({ skip: offset, take: 100, relations: ['xpert'] }).pipe(
            take(1),
            map((response) => ({ ...response, offset }))
          )
        return fetchPage(0).pipe(
          expand((page) =>
            page.items.length && page.offset + page.items.length < page.total
              ? fetchPage(page.offset + page.items.length)
              : EMPTY
          ),
          reduce((items: IXpertTask[], page) => [...items, ...page.items], []),
          map((items) =>
            searchPage(
              items
                .filter((item) =>
                  matchesSidebarSearch(
                    query,
                    item.name,
                    item.prompt,
                    item.scheduleDescription,
                    item.xpert?.title,
                    item.xpert?.name
                  )
                )
                .map((item) => ({
                  id: item.id,
                  title: item.name,
                  description: item.scheduleDescription,
                  icon: 'ri-alarm-line',
                  route: ['/chat/tasks'],
                  queryParams: { taskId: item.id }
                })),
              offset
            )
          )
        )
      }
      case 'projects':
        return this.projects.list({ search: query, status: 'all', skip: offset, take: SIDEBAR_SEARCH_PAGE_SIZE }).pipe(
          map(({ items, total }) => ({
            total,
            items: items.map((item) => ({
              id: item.id,
              title: item.name,
              description: item.description,
              icon: 'ri-folder-line',
              route: ['/project', item.id]
            }))
          }))
        )
      case 'conversations':
      case 'archivedConversations':
        if (!context.assistantId || !context.conversationRoute) return of({ items: [], total: 0 })
        return this.conversations
          .getSidebarConversations(
            context.assistantId,
            SIDEBAR_SEARCH_PAGE_SIZE,
            offset,
            source === 'archivedConversations',
            query
          )
          .pipe(
            map(({ items, total }) => ({
              total,
              items: items.map((item) => ({
                id: item.id,
                title: item.title || this.translate.instant('XP.Sidebar.NewConversation'),
                icon: source === 'archivedConversations' ? 'ri-archive-line' : 'ri-chat-3-line',
                route: [...context.conversationRoute, item.threadId]
              }))
            }))
          )
      case 'plugins':
        return this.plugins.getPlugins().pipe(
          map((items) =>
            searchPage(
              items
                .filter((item) =>
                  matchesSidebarSearch(
                    query,
                    item.name,
                    item.meta.displayName,
                    item.meta.description,
                    ...(item.meta.keywords ?? [])
                  )
                )
                .map((item) => ({
                  id: `${item.level}:${item.isGlobal}:${item.name}`,
                  title: this.label(item.meta.displayName) || item.name,
                  description: item.name,
                  icon: 'ri-plug-line',
                  route: ['/plugins'],
                  queryParams: { category: 'plugins', search: item.name }
                })),
              offset
            )
          )
        )
      case 'marketplace':
        return this.plugins.getMarketplace({ view: 'summary' }).pipe(
          map(({ items, errors }) => ({
            ...searchPage(
              items
                .filter((item) =>
                  matchesSidebarSearch(query, item.name, item.displayName, item.description, ...(item.keywords ?? []))
                )
                .map((item) => ({
                  id: item.name,
                  title: this.label(item.displayName) || item.name,
                  description: item.name,
                  icon: 'ri-store-2-line',
                  route: pluginMarketplaceDetailCommands(item.name)
                })),
              offset
            ),
            // A failed source must not be silently presented as an exhaustive empty result.
            incomplete: !!errors?.length
          }))
        )
      case 'agentPlugins':
        return this.http
          .get<{ packages: PackageSummary[]; bindings: BindingSummary[] }>(`${API_PREFIX}/agent-plugins`)
          .pipe(
            map(({ packages, bindings }) =>
              searchPage(
                groupPluginPackages(packages, bindings, this.translate.currentLang)
                  .filter((item) => matchesSidebarSearch(query, item.name, item.title, item.description))
                  .map((item) => ({
                    id: item.name,
                    title: item.title,
                    description: item.name,
                    icon: 'ri-puzzle-line',
                    route: ['/plugins'],
                    queryParams: { category: 'agent-plugins', search: item.name }
                  })),
                offset
              )
            )
          )
      case 'models':
        return forkJoin(
          Object.values(AiModelTypeEnum).map((type) => this.models.getManagementCopilotModels(type).pipe(take(1)))
        ).pipe(
          map((catalogs) => {
            const items = new Map<string, SidebarSearchResult>()
            for (const copilot of catalogs.flat()) {
              const provider = copilot.providerWithModels
              const name = provider?.provider || copilot.modelProvider?.providerName || copilot.name
              const title = this.label(provider?.label) || name
              if (matchesSidebarSearch(query, name, provider?.label, provider?.description, copilot.name)) {
                items.set(copilot.id, {
                  id: copilot.id,
                  title,
                  description: copilot.name,
                  icon: 'ri-brain-line',
                  route: ['/copilot/basic'],
                  queryParams: { copilotId: copilot.id }
                })
              }
              for (const model of provider?.models ?? []) {
                if (!matchesSidebarSearch(query, name, provider.label, model.model, model.label, model.model_type))
                  continue
                const id = `${copilot.id}:${model.model_type}:${model.model}`
                items.set(id, {
                  id,
                  title: this.label(model.label) || model.model,
                  description: `${title} · ${model.model}`,
                  icon: 'ri-cpu-line',
                  route: ['/copilot/basic'],
                  queryParams: { copilotId: copilot.id }
                })
              }
            }
            return searchPage([...items.values()], offset)
          })
        )
      case 'publications':
        return this.publications.list().pipe(
          map((items) =>
            searchPage(
              items
                .filter((item) => matchesSidebarSearch(query, item.name, item.slug, item.status, item.instructions))
                .map((item) => ({
                  id: item.id,
                  title: item.name,
                  description: item.slug,
                  icon: 'ri-plug-line',
                  route: ['/operations'],
                  queryParams: { section: 'services', publicationId: item.id }
                })),
              offset
            )
          )
        )
      case 'runtimes':
        // The runtime endpoint paginates before filtering. Read every accessible page, not only its default page.
        return this.runtimes.listAll({ status: 'all' }).pipe(
          map((items) =>
            searchPage(
              items
                .filter((item) =>
                  matchesSidebarSearch(
                    query,
                    item.id,
                    item.serverName,
                    item.toolsetName,
                    item.pluginName,
                    item.executionId,
                    item.status
                  )
                )
                .map((item) => ({
                  id: item.id,
                  title: item.serverName,
                  description: item.toolsetName || item.pluginName || item.id,
                  icon: 'ri-pulse-line',
                  route: ['/operations'],
                  queryParams: { section: 'runtimes', runtimeId: item.id }
                })),
              offset
            )
          )
        )
      case 'targets':
        return this.evolution.listTargets(page).pipe(
          map(({ items, total }) => ({
            total,
            items: items.map((item) => ({
              id: item.targetId,
              title: item.displayName,
              description: item.providerKey,
              icon: 'ri-focus-3-line',
              route: ['/agent-evolution/targets', item.targetId]
            }))
          }))
        )
      case 'learning':
        return this.evolution.listLearningEvents(page).pipe(
          map(({ items, total }) => ({
            total,
            items: items.map((item) => ({
              id: item.eventId,
              title: item.finalOutcomeSummary || item.predictionSummary || item.eventId,
              description: item.targetId,
              icon: 'ri-lightbulb-line',
              route: ['/agent-evolution/learning'],
              queryParams: { eventId: item.eventId, reviewStatus: item.reviewStatus || 'pending' }
            }))
          }))
        )
      case 'candidates':
        return this.evolution.listCandidates(page).pipe(
          map(({ items, total }) => ({
            total,
            items: items.map((item) => ({
              id: item.candidateId,
              title: item.candidateId,
              description: item.targetId,
              icon: 'ri-git-branch-line',
              route: ['/agent-evolution/candidates', item.candidateId]
            }))
          }))
        )
      case 'evaluations':
        return this.evolution.listEvaluations(page).pipe(
          map(({ items, total }) => ({
            total,
            items: items.map((item) => ({
              id: item.runId,
              title: item.runId,
              description: item.status,
              icon: 'ri-checkbox-circle-line',
              route: ['/agent-evolution/evaluations', item.runId]
            }))
          }))
        )
      case 'deployments':
        return this.evolution.listDeployments(page).pipe(
          map(({ items, total }) => ({
            total,
            items: items.map((item) => ({
              id: item.deploymentId,
              title: item.releasePackageId,
              description: item.status,
              icon: 'ri-upload-cloud-line',
              route: ['/agent-evolution/deployments', item.deploymentId]
            }))
          }))
        )
      case 'approvals':
        return this.approvals.findReviewableRequests().pipe(
          map((items) =>
            searchPage(
              items
                .filter((item) =>
                  matchesSidebarSearch(
                    query,
                    item.xpert?.title,
                    item.xpert?.name,
                    item.xpert?.slug,
                    item.xpertId,
                    item.requester?.firstName,
                    item.requester?.lastName,
                    item.requester?.email,
                    item.requester?.username,
                    item.requesterId,
                    item.reason
                  )
                )
                .map((item) => ({
                  id: item.id,
                  title: item.xpert?.title || item.xpert?.name || item.xpertId,
                  description: item.requester?.email || item.requesterId,
                  icon: 'ri-shield-check-line',
                  route: ['/xpert-access-requests'],
                  queryParams: { search: item.xpertId }
                })),
              offset
            )
          )
        )
    }
  }

  private label(value: Parameters<typeof resolveI18nText>[0]) {
    return resolveI18nText(value, this.translate.currentLang) || ''
  }
}
