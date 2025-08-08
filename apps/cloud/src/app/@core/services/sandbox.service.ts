import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX } from '@metad/cloud/state'
import { Observable } from 'rxjs'

@Injectable({
  providedIn: 'root'
})
export class SandboxService {
  constructor(private http: HttpClient) {}

  uploadFile(file: File, params: {workspace: string; conversationId: string; path: string}) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('workspace', params.workspace)
    formData.append('conversationId', params.conversationId)
    formData.append('path', params.path)

    return this.http.post<{ url: string; filePath: string }>(`${API_PREFIX}/sandbox/file`, formData)
  }
}
