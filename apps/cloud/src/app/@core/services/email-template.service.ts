import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService } from '@metad/cloud/state'
import {
  ICustomizableEmailTemplate,
  ICustomizeEmailTemplateFindInput,
  IEmailTemplate,
  IEmailTemplateSaveInput
} from '@metad/contracts'
import { firstValueFrom } from 'rxjs'
import { API_EMAIL_TEMPLATE } from '../constants/app.constants'

@Injectable({
  providedIn: 'root'
})
export class EmailTemplateService extends OrganizationBaseCrudService<IEmailTemplate> {
  constructor(private http: HttpClient) {
    super(API_EMAIL_TEMPLATE)
  }

  // getAll(
  //   relations?: string[],
  //   findInput?: IEmailTemplateFindInput
  // ) {
  //   const data = JSON.stringify({ relations, findInput })
  //   return this.http.get<{ items: IEmailTemplate[]; total: number }>(`${API_PREFIX}/email-template`, {
  //     params: { data }
  //   })
  // }

  getTemplate(findInput?: ICustomizeEmailTemplateFindInput): Promise<ICustomizableEmailTemplate> {
    const data = JSON.stringify({ findInput })
    return firstValueFrom(
      this.http.get<ICustomizableEmailTemplate>(`${API_PREFIX}/email-template/template`, {
        params: { data }
      })
    )
  }

  generateTemplatePreview(data: string): Promise<{ html: string }> {
    return firstValueFrom(
      this.http.post<{ html: string }>(`${API_PREFIX}/email-template/template/preview`, {
        data
      })
    )
  }

  saveEmailTemplate(data: IEmailTemplateSaveInput): Promise<ICustomizableEmailTemplate> {
    return firstValueFrom(
      this.http.post<ICustomizableEmailTemplate>(`${API_PREFIX}/email-template/template/save`, {
        data
      })
    )
  }

}
