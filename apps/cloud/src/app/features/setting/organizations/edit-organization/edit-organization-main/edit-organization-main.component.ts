import { Component, effect, inject } from '@angular/core'
import { UntypedFormGroup } from '@angular/forms'
import { Router } from '@angular/router'
import { IOrganization } from '@metad/contracts'
import { getErrorMessage } from '@metad/core'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { OrganizationsService, ToastrService } from '../../../../../@core'
import { timezones } from '../../../../../@core/constants'
import { EditOrganizationComponent } from '../edit-organization.component'
import { FORMLY_ROW, FORMLY_W_1_2 } from '@metad/story/designer'
import { FORMLY_W_FULL } from '@metad/formly'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { CommonModule } from '@angular/common'


@Component({
  standalone: true,
  imports: [SharedModule, CommonModule, FormlyModule],
  selector: 'pac-edit-org-main',
  templateUrl: './edit-organization-main.component.html',
  styleUrls: ['./edit-organization-main.component.scss']
})
export class EditOrganizationMainComponent {
  private readonly toastrService = inject(ToastrService)

  form = new UntypedFormGroup({})
  model = {} as IOrganization
  fields: FormlyFieldConfig[] = []

  constructor(
    public editOrganizationComponent: EditOrganizationComponent,
    private readonly router: Router,
    private readonly organizationService: OrganizationsService,
    readonly translateService: TranslateService
  ) {
    effect(() => {
      const org = this.editOrganizationComponent.organization()
      if (org) {
        this.form.patchValue(org)
        this.model = { ...org }
      }
    }, { allowSignalWrites: true })
  }

  handleImageUploadError(event: any) {}

  ngOnInit(): void {
    const className = FORMLY_W_1_2
    this.translateService.get('PAC.ORGANIZATIONS_PAGE.Organization').subscribe((Organization) => {
      this.fields = [
        {
          fieldGroupClassName: FORMLY_ROW,
          fieldGroup: [
            {
              className: FORMLY_W_FULL,
              key: 'name',
              type: 'input',
              props: {
                label: Organization?.Name ?? 'Name',
                placeholder: Organization?.OrganizationName ?? 'Organization Name',
              }
            },
            {
              className,
              key: 'isDefault',
              type: 'toggle',
              props: {
                label: Organization?.IsDefault ?? 'Is Default',
                placeholder: Organization?.SetAsDefault ?? 'Set as Default',
                color: 'accent'
              }
            },
            {
              className,
              key: 'isActive',
              type: 'toggle',
              props: {
                label: Organization?.IsActive ?? 'Is Active',
                placeholder: Organization?.ActiveOrganization ?? 'Active Organization',
                color: 'accent'
              }
            },
            {
              className,
              key: 'profile_link',
              type: 'input',
              props: {
                label: Organization?.ProfileLink ?? 'Profile Link',
              }
            },
            {
              className,
              key: 'officialName',
              type: 'input',
              props: {
                label: Organization?.OfficialName ?? 'Official Name',
              }
            },
            {
              className,
              key: 'short_description',
              type: 'textarea',
              props: {
                label: Organization?.ShortDescription ?? 'Short Description',
                autosize: true
              }
            },
            {
              className,
              key: 'website',
              type: 'input',
              props: {
                label: Organization?.Website ?? 'Website',
              }
            },
            {
              className,
              key: 'invitesAllowed',
              type: 'toggle',
              props: {
                label: Organization?.InvitesAllowed ?? 'Invites Allowed',
                placeholder: Organization?.EnableInvitesAllowed ?? 'Enable Invites Allowed',
                color: 'accent'
              }
            },
            {
              className,
              key: 'inviteExpiryPeriod',
              type: 'input',
              props: {
                label: Organization?.InviteExpiryPeriod ?? 'Invite Expiry Period',
                placeholder: Organization?.InviteExpiryPeriod ?? 'Invite Expiry Period (in Days)',
                type: 'number',
              }
            },
            {
              className,
              key: 'currency',
              type: 'input',
              props: {
                label: Organization?.Currency ?? 'Currency',
                placeholder: Organization?.Currency ?? 'Currency',
                type: 'text',
              }
            },
            {
              className: FORMLY_W_FULL,
              key: 'timeZone',
              type: 'select',
              props: {
                label: Organization?.TimeZone ?? 'Time Zone',
                placeholder: Organization?.SelectTimeZone ?? 'Select a Time Zone',
                options: timezones.map((item) => ({
                  value: item.value,
                  label: item.name
                })),
                searchable: true
              }
            }
          ]
        }
      ]
    })
  }

  onFormChange(model) {}

  async updateOrganizationSettings() {
    try {
      const organization = await firstValueFrom(
        this.organizationService.update(this.editOrganizationComponent.selectedOrg.id, {
          defaultValueDateType: this.editOrganizationComponent.selectedOrg.defaultValueDateType,
          ...this.form.value
        })
      )
      this.toastrService.success(`PAC.MESSAGE.MAIN_ORGANIZATION_UPDATED`, { Default: 'Main Org Updated' })
      this.goBack()
    } catch (error) {
      this.toastrService.error(getErrorMessage(error))
    }
  }

  goBack() {
    this.router.navigate([`/settings/organizations`])
  }
}
