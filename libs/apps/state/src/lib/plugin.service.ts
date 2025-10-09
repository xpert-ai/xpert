import { HttpClient } from "@angular/common/http"
import { inject, Injectable } from "@angular/core"
import { NGXLogger } from "ngx-logger"
import { API_PREFIX } from "./constants"
import { PluginMeta } from "./types"

@Injectable({ providedIn: 'root' })
export class PluginAPIService {
  readonly #logger = inject(NGXLogger)

  readonly httpClient = inject(HttpClient)
  readonly apiBaseUrl = API_PREFIX + `/plugin`

  getPlugins() {
    return this.httpClient.get<{name: string; meta: PluginMeta}[]>(this.apiBaseUrl)
  }
}