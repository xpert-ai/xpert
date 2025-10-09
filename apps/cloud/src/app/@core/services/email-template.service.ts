import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { API_PREFIX, BaseOrgCrudService } from '@metad/cloud/state'
import {
  ICustomizableEmailTemplate,
  ICustomizeEmailTemplateFindInput,
  IEmailTemplate,
  IEmailTemplateSaveInput
} from '@metad/contracts'
import { firstValueFrom, switchMap } from 'rxjs'
import { API_EMAIL_TEMPLATE } from '../constants/app.constants'

@Injectable({
  providedIn: 'root'
})
export class EmailTemplateService extends BaseOrgCrudService<IEmailTemplate> {
  constructor(private http: HttpClient) {
    super(API_EMAIL_TEMPLATE)
  }

  getAllInOrg() {
    return this.selectOrganizationId().pipe(
      switchMap((organizationId) =>
        super.getAll({
          where: {
            organizationId: organizationId ? organizationId : {
              $isNull: true
            }
          }
        })
      )
    )
  }

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
