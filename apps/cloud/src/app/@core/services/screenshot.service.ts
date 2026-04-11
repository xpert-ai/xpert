import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { IScreenshot } from '../types'

export const C_API_SCREENSHOT = API_PREFIX + '/screenshot'

@Injectable({
  providedIn: 'root'
})
export class ScreenshotService {
  private readonly httpClient = inject(HttpClient)

  getAll() {
    return this.httpClient.get<{items: IScreenshot[], total: number}>(C_API_SCREENSHOT)
  }

  create(input: FormData) {
    return this.httpClient.post<IScreenshot>(C_API_SCREENSHOT, input)
  }

  update(id: string, input) {
    return this.httpClient.put(`${C_API_SCREENSHOT}/${id}`, input)
  }

  delete(id: string) {
    return this.httpClient.delete(`${C_API_SCREENSHOT}/${id}`)
  }
}
