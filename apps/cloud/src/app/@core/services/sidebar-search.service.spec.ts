import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom, of } from 'rxjs'
import { ChatConversationService, CopilotServerService, XpertMarketplaceService, XpertTaskService } from '..'
import { PluginAPIService } from '../state/plugin.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpRuntimeService } from './mcp-runtime.service'
import { XpertProjectApiService } from '../../features/project/project-api.service'
import { AgentEvolutionApiService } from '../../features/agent-evolution/agent-evolution-api.service'
import { SidebarSearchService } from './sidebar-search.service'
import { matchesSidebarSearch } from '../../features/sidebar/search/sidebar-search.types'

const tasks = { getMyAll: jest.fn() }
const projects = { list: jest.fn() }
const conversations = { getSidebarConversations: jest.fn() }
const plugins = { getPlugins: jest.fn(), getMarketplace: jest.fn() }
const models = { getManagementCopilotModels: jest.fn() }
const publications = { list: jest.fn() }
const runtimes = { listAll: jest.fn() }
const evolution = {
  listTargets: jest.fn(),
  listLearningEvents: jest.fn(),
  listCandidates: jest.fn(),
  listEvaluations: jest.fn(),
  listDeployments: jest.fn()
}
const approvals = { findReviewableRequests: jest.fn() }

describe('domain-specific sidebar search', () => {
  let api: SidebarSearchService
  beforeEach(() => {
    jest.resetAllMocks()
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: XpertTaskService, useValue: tasks },
        { provide: XpertProjectApiService, useValue: projects },
        { provide: ChatConversationService, useValue: conversations },
        { provide: PluginAPIService, useValue: plugins },
        { provide: CopilotServerService, useValue: models },
        { provide: McpPublicationService, useValue: publications },
        { provide: McpRuntimeService, useValue: runtimes },
        { provide: AgentEvolutionApiService, useValue: evolution },
        { provide: XpertMarketplaceService, useValue: approvals }
      ]
    })
    api = TestBed.inject(SidebarSearchService)
  })

  it('searches automations beyond the first page using task metadata', async () => {
    tasks.getMyAll
      .mockReturnValueOnce(of({ items: [{ id: '1', name: 'Other' }], total: 2 }))
      .mockReturnValueOnce(of({ items: [{ id: '2', name: 'Automation', prompt: 'needle' }], total: 2 }))
    const result = await firstValueFrom(api.search('automations', 'needle', 0, {}))
    expect(tasks.getMyAll).toHaveBeenLastCalledWith({ skip: 1, take: 100, relations: ['xpert'] })
    expect(result.items[0].queryParams).toEqual({ taskId: '2' })
  })

  it('queries accessible projects beyond recent items and forwards pagination and archived status', async () => {
    projects.list.mockReturnValue(
      of({ items: [{ id: 'older', name: 'Needle', description: 'Archived project' }], total: 41 })
    )
    const result = await firstValueFrom(api.search('projects', 'needle', 20, {}))
    expect(projects.list).toHaveBeenCalledWith({ search: 'needle', status: 'all', take: 20, skip: 20 })
    expect(result.items[0].route).toEqual(['/project', 'older'])
    expect(result.total).toBe(41)
  })

  it.each([
    ['conversations', false],
    ['archivedConversations', true]
  ] as const)('searches %s only within the chosen assistant', async (source, archived) => {
    conversations.getSidebarConversations.mockReturnValue(
      of({ items: [{ id: 'c', title: 'Needle', threadId: 'thread' }], total: 1 })
    )
    const result = await firstValueFrom(
      api.search(source, 'needle', 20, { assistantId: 'a', conversationRoute: ['/chat/x', 'slug', 'c'] })
    )
    expect(conversations.getSidebarConversations).toHaveBeenCalledWith('a', 20, 20, archived, 'needle')
    expect(result.items[0].route).toEqual(['/chat/x', 'slug', 'c', 'thread'])
  })

  it('does not request unbound conversations', async () => {
    expect(await firstValueFrom(api.search('conversations', 'q', 0, {}))).toEqual({ items: [], total: 0 })
    expect(conversations.getSidebarConversations).not.toHaveBeenCalled()
  })

  it('searches plugin translations and keywords, uses exact marketplace destinations and reports partial sources', async () => {
    plugins.getPlugins.mockReturnValue(
      of([{ name: '@test/tool', meta: { displayName: { en_US: 'Tool', zh_Hans: '工具' }, keywords: ['needle'] } }])
    )
    plugins.getMarketplace.mockReturnValue(
      of({ items: [{ name: '@test/market', description: 'needle' }], errors: [{ sourceId: 'failed' }] })
    )
    const installed = await firstValueFrom(api.search('plugins', '工具 needle', 0, {}))
    expect(installed.items[0].queryParams).toEqual({ category: 'plugins', search: '@test/tool' })
    const market = await firstValueFrom(api.search('marketplace', 'needle', 0, {}))
    expect(market.items[0].route).toEqual(['/plugins/marketplace', 'test', 'market'])
    expect(market.incomplete).toBe(true)
  })

  it('searches configured providers and all model types without duplicating providers', async () => {
    models.getManagementCopilotModels.mockReturnValue(
      of([
        {
          id: 'copilot',
          name: 'Primary',
          providerWithModels: {
            provider: 'acme',
            label: { en_US: 'Acme' },
            models: [{ model: 'needle', label: { en_US: 'Reasoning' }, model_type: 'llm' }]
          }
        }
      ])
    )
    const result = await firstValueFrom(api.search('models', 'acme', 0, {}))
    expect(models.getManagementCopilotModels.mock.calls.length).toBeGreaterThan(1)
    expect(result.items.map((item) => item.id)).toEqual(['copilot', 'copilot:llm:needle'])
    expect(result.items[1].queryParams).toEqual({ copilotId: 'copilot' })
  })

  it('searches MCP names and runtime metadata but never commands or configuration', async () => {
    publications.list.mockReturnValue(of([{ id: 'p', name: 'Needle service', slug: 'n' }]))
    runtimes.listAll.mockReturnValue(
      of([
        { id: 'a', serverName: 'Unrelated', command: 'secret needle' },
        { id: 'b', serverName: 'Needle runtime' }
      ])
    )
    const services = await firstValueFrom(api.search('publications', 'needle', 0, {}))
    const runs = await firstValueFrom(api.search('runtimes', 'needle', 0, {}))
    expect(services.items[0].queryParams).toEqual({ section: 'services', publicationId: 'p' })
    expect(runs.items.map((item) => item.id)).toEqual(['b'])
  })

  it.each([
    ['targets', 'listTargets', { targetId: 'a', displayName: 'A' }, '/agent-evolution/targets'],
    ['candidates', 'listCandidates', { candidateId: 'a' }, '/agent-evolution/candidates'],
    ['evaluations', 'listEvaluations', { runId: 'a' }, '/agent-evolution/evaluations'],
    ['deployments', 'listDeployments', { deploymentId: 'a' }, '/agent-evolution/deployments']
  ] as const)('uses the paged %s API and object route', async (source, method, item, route) => {
    evolution[method].mockReturnValue(of({ items: [item], total: 42 }))
    const result = await firstValueFrom(api.search(source, 'needle', 20, {}))
    expect(evolution[method]).toHaveBeenCalledWith({ search: 'needle', page: 2, pageSize: 20 })
    expect(result.items[0].route).toEqual([route, 'a'])
  })

  it('retains ignored learning event context when opening a match', async () => {
    evolution.listLearningEvents.mockReturnValue(
      of({ items: [{ eventId: 'a', finalOutcomeSummary: 'Needle', reviewStatus: 'ignored' }], total: 1 })
    )
    const result = await firstValueFrom(api.search('learning', 'needle', 0, {}))
    expect(result.items[0].queryParams).toEqual({ eventId: 'a', reviewStatus: 'ignored' })
  })

  it('searches only reviewable approvals by requester and reason', async () => {
    approvals.findReviewableRequests.mockReturnValue(
      of([{ id: 'r', xpertId: 'a', reason: 'needle', requester: { email: 'tester@example.test' } }])
    )
    const result = await firstValueFrom(api.search('approvals', 'TESTER needle', 0, {}))
    expect(result.items[0].queryParams).toEqual({ search: 'a' })
  })

  it('supports localized fields and whitespace without interpreting wildcard characters', () => {
    expect(matchesSidebarSearch(' 工具 NEEDLE ', { en_US: 'Needle tool', zh_Hans: '工具' })).toBe(true)
    expect(matchesSidebarSearch('%', 'anything')).toBe(false)
  })

  it('reads scoped Agent plugin package summaries without loading binding configuration into results', async () => {
    const result = firstValueFrom(api.search('agentPlugins', 'needle', 0, {}))
    TestBed.inject(HttpTestingController)
      .expectOne('/api/agent-plugins')
      .flush({
        packages: [{ id: 'p', digest: 'digest', descriptor: { name: 'needle', skills: [], servers: [] } }],
        bindings: []
      })
    expect((await result).items[0].queryParams).toEqual({ category: 'agent-plugins', search: 'needle' })
    TestBed.inject(HttpTestingController).verify()
  })
})
