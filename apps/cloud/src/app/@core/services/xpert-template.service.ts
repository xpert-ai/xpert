import { HttpClient } from '@angular/common/http'
import { inject, Injectable } from '@angular/core'
import {
  ICopilotModel,
  ITemplateSkillSyncResult,
  IXpert,
  TAvatar,
  TemplateSkillSyncMode,
  TXpertTemplateCatalogPage,
  TXpertTemplateCatalogQuery,
  TXpertTemplateSummary,
  XpertWorkspaceDataScope
} from '@xpert-ai/contracts'
import { API_PREFIX, PaginationParams, TKnowledgePipelineTemplate, toHttpParams } from '@cloud/app/@core/state'
import { NGXLogger } from 'ngx-logger'
import { EMPTY, expand, reduce } from 'rxjs'
import { ISkillMarketConfig, IXpertMCPTemplate, IXpertTemplate, TXpertTemplate } from '../types'

@Injectable({ providedIn: 'root' })
export class XpertTemplateService {
  readonly #logger = inject(NGXLogger)
  readonly #httpClient = inject(HttpClient)

  getAll() {
    return this.#httpClient.get<{ categories: string[]; recommendedApps: TXpertTemplate[] }>(
      API_PREFIX + `/xpert-template`
    )
  }

  getCatalog(query: TXpertTemplateCatalogQuery = {}) {
    return this.#httpClient.get<TXpertTemplateCatalogPage>(API_PREFIX + '/xpert-template/catalog', {
      params: {
        ...(query.search ? { search: query.search } : {}),
        ...(query.category ? { category: query.category } : {}),
        ...(query.pluginName ? { pluginName: query.pluginName } : {}),
        offset: query.offset ?? 0,
        limit: query.limit ?? 48
      }
    })
  }

  /** Fetch lightweight pages for the existing client-side category/search controls. */
  getSummaries() {
    return this.getCatalog({ limit: 500 }).pipe(
      expand((page) =>
        page.items.length && page.offset + page.items.length < page.total
          ? this.getCatalog({ offset: page.offset + page.items.length, limit: page.limit })
          : EMPTY
      ),
      reduce((items: TXpertTemplateSummary[], page) => [...items, ...page.items], [])
    )
  }

  getTemplate(id: string, locale?: string) {
    return this.#httpClient.get<TXpertTemplate>(API_PREFIX + `/xpert-template/${encodeURIComponent(id)}`, {
      params: locale ? { locale } : {}
    })
  }

  installTemplate(
    id: string,
    body: {
      workspaceId: string
      publish?: boolean
      locale?: string
      basic?: {
        name?: string
        title?: string
        description?: string
        avatar?: TAvatar
        copilotModel?: ICopilotModel
        workspaceDataScope?: XpertWorkspaceDataScope
      }
    }
  ) {
    return this.#httpClient.post<{ xpert?: IXpert }>(
      API_PREFIX + `/xpert-template/${encodeURIComponent(id)}/install`,
      body
    )
  }

  getAllMCP(paginationParams: PaginationParams<IXpertTemplate>) {
    return this.#httpClient.get<{ categories: string[]; templates: IXpertMCPTemplate[] }>(
      API_PREFIX + `/xpert-template/mcps`,
      {
        params: toHttpParams(paginationParams)
      }
    )
  }

  getMCPTemplate(id: string) {
    return this.#httpClient.get<IXpertMCPTemplate>(API_PREFIX + `/xpert-template/mcps/${encodeURIComponent(id)}`)
  }

  getAllKnowledgePipelines(paginationParams: PaginationParams<IXpertTemplate>) {
    return this.#httpClient.get<{ categories: string[]; templates: TKnowledgePipelineTemplate[] }>(
      API_PREFIX + `/xpert-template/pipelines`,
      {
        params: toHttpParams(paginationParams)
      }
    )
  }

  getKnowledgePipelineTemplate(id: string) {
    return this.#httpClient.get<TKnowledgePipelineTemplate>(
      API_PREFIX + `/xpert-template/pipelines/${encodeURIComponent(id)}`
    )
  }

  getSkillsMarket() {
    return this.#httpClient.get<ISkillMarketConfig>(API_PREFIX + `/xpert-template/skills-market`)
  }

  syncSkillAssets(body?: { mode?: TemplateSkillSyncMode; validateOnly?: boolean }) {
    return this.#httpClient.post<ITemplateSkillSyncResult>(API_PREFIX + `/xpert-template/sync-skill-assets`, body ?? {})
  }
}
