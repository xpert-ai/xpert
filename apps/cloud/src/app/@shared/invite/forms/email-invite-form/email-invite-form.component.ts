import { Component, DestroyRef, ElementRef, Input, OnDestroy, OnInit, inject } from '@angular/core'
import { FormBuilder, FormGroup, Validators } from '@angular/forms'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import {
  ICreateEmailInvitesOutput,
  IOrganization,
  IOrganizationContact,
  IOrganizationDepartment,
  IOrganizationProject,
  IRole,
  IUser,
  InvitationExpirationEnum,
  InvitationTypeEnum,
  RolesEnum
} from '../../../../@core/types'
import { TranslateService } from '@ngx-translate/core'
import { AuthService, InviteService } from '@metad/cloud/state'
import { firstValueFrom } from 'rxjs'
import { filter, tap } from 'rxjs/operators'
import { EmailValidator } from '../../../../@core/validators'
import { FormHelpers } from '../../../forms/helpers'
import { TranslationBaseComponent } from '../../../language/translation-base.component'
import { Store } from './../../../../@core/services'

@Component({
  selector: 'pac-email-invite-form',
  templateUrl: 'email-invite-form.component.html',
  styleUrls: ['email-invite-form.component.scss']
})
export class EmailInviteFormComponent extends TranslationBaseComponent implements OnInit, OnDestroy {

  readonly destroyRef = inject(DestroyRef)
  
  FormHelpers: typeof FormHelpers = FormHelpers

  invitationTypeEnum = InvitationTypeEnum
  roles: any[] = []
  invitationExpiryOptions: any = []

  @Input() public organizationProjects: IOrganizationProject[]
  @Input() public organizationContacts: IOrganizationContact[]
  @Input() public organizationDepartments: IOrganizationDepartment[]

  /*
   * Getter & Setter for InvitationTypeEnum
   */
  _invitationType: InvitationTypeEnum
  get invitationType(): InvitationTypeEnum {
    return this._invitationType
  }
  @Input() set invitationType(value: InvitationTypeEnum) {
    this._invitationType = value
    this.setFormValidators()
  }

  /**
   * Build email invite form group
   *
   */
  public form: FormGroup = EmailInviteFormComponent.buildForm(this.fb)
  static buildForm(fb: FormBuilder): FormGroup {
    return fb.group(
      {
        emails: ['', Validators.required],
        projects: [],
        startedWorkOn: [],
        appliedDate: [],
        departments: [],
        organizationContacts: [],
        role: [],
        invitationExpirationPeriod: []
      },
      {
        validators: [EmailValidator.pattern('emails')]
      }
    )
  }

  tagInput: ElementRef<HTMLInputElement>

  user: IUser
  organization: IOrganization

  emails: Set<string> = new Set([])
  excludes: RolesEnum[] = []

  constructor(
    private readonly fb: FormBuilder,
    private readonly inviteService: InviteService,
    private readonly store: Store,
    public readonly translateService: TranslateService,
    private readonly authService: AuthService
  ) {
    super()
  }

  ngOnInit(): void {
    this.store.user$
      .pipe(
        filter((user: IUser) => !!user),
        tap((user: IUser) => (this.user = user)),
        tap(() => this.excludeRoles()),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    this.store.selectedOrganization$
      .pipe(
        filter((organization: IOrganization) => !!organization),
        tap((organization: IOrganization) => (this.organization = organization)),
        tap(() => this.renderInvitationExpiryOptions()),
        filter((organization) => !!organization.invitesAllowed),
        tap((organization) => this.setInvitationPeriodFormValue(organization)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  /**
   * Exclude roles
   */
  async excludeRoles() {
    const hasSuperAdminRole = await firstValueFrom(this.authService.hasRole([RolesEnum.SUPER_ADMIN]))
    this.excludes = [RolesEnum.EMPLOYEE]
    if (!hasSuperAdminRole) {
      this.excludes.push(RolesEnum.SUPER_ADMIN)
    }
  }

  /**
   * Render Invitation Expiry Options
   */
  renderInvitationExpiryOptions() {
    this.invitationExpiryOptions = [
      {
        label: this.getTranslation('PAC.INVITE_PAGE.INVITATION_EXPIRATION_OPTIONS.DAY', { Default: '1 Day' }),
        value: InvitationExpirationEnum.DAY
      },
      {
        label: this.getTranslation('PAC.INVITE_PAGE.INVITATION_EXPIRATION_OPTIONS.WEEK', { Default: '1 Week' }),
        value: InvitationExpirationEnum.WEEK
      },
      {
        label: this.getTranslation('PAC.INVITE_PAGE.INVITATION_EXPIRATION_OPTIONS.TWO_WEEK', { Default: '2 Week' }),
        value: InvitationExpirationEnum.TWO_WEEK
      },
      {
        label: this.getTranslation('PAC.INVITE_PAGE.INVITATION_EXPIRATION_OPTIONS.MONTH', { Default: '1 Month' }),
        value: InvitationExpirationEnum.MONTH
      },
      {
        label: this.getTranslation('PAC.INVITE_PAGE.INVITATION_EXPIRATION_OPTIONS.NEVER', { Default: 'Never' }),
        value: InvitationExpirationEnum.NEVER
      }
    ]
  }

  isEmployeeInvitation() {
    return this.invitationType === InvitationTypeEnum.EMPLOYEE
  }

  isCandidateInvitation() {
    return this.invitationType === InvitationTypeEnum.CANDIDATE
  }

  /**
   * SELECT all organization projects
   */
  selectAllProjects() {
    const organizationProjects = this.organizationProjects
      .filter((project) => !!project.id)
      .map((project) => project.id)

    this.form.get('projects').setValue(organizationProjects)
    this.form.get('projects').updateValueAndValidity()
  }

  /**
   * SELECT all organization departments
   */
  selectAllDepartments() {
    const organizationDepartments = this.organizationDepartments
      .filter((department) => !!department.id)
      .map((department) => department.id)

    this.form.get('departments').setValue(organizationDepartments)
    this.form.get('departments').updateValueAndValidity()
  }

  /**
   * SELECT all organization contacts
   */
  selectAllOrganizationContacts() {
    const organizationContacts = this.organizationContacts
      .filter((organizationContact) => !!organizationContact.id)
      .map((organizationContact) => organizationContact.id)

    this.form.get('organizationContacts').setValue(organizationContacts)
    this.form.get('organizationContacts').updateValueAndValidity()
  }

  getRoleFromForm = () => {
    if (this.isEmployeeInvitation()) {
      return RolesEnum.EMPLOYEE
    }
    if (this.isCandidateInvitation()) {
      return RolesEnum.CANDIDATE
    }
    return this.form.get('role').value.name || RolesEnum.VIEWER
  }

  async saveInvites(): Promise<ICreateEmailInvitesOutput> {
    if (this.form.invalid) {
      return Promise.reject()
    }

    const { tenantId, id: invitedById } = this.store.user
    const { id: organizationId } = this.organization

    const {
      role,
      startedWorkOn,
      appliedDate,
      emails,
      invitationExpirationPeriod,
      projects = [],
      departments = [],
      organizationContacts = []
    } = this.form.value

    return this.inviteService.createWithEmails({
      emailIds: emails,
      projectIds: projects,
      departmentIds: departments,
      organizationContactIds: organizationContacts,
      roleId: role,
      organizationId,
      tenantId,
      invitedById,
      inviteType: this.invitationType,
      startedWorkOn: startedWorkOn ? new Date(startedWorkOn) : null,
      appliedDate: appliedDate ? new Date(appliedDate) : null,
      invitationExpirationPeriod
    })
  }

  /**
   * SET form validators
   *
   */
  setFormValidators() {
    if (this.isEmployeeInvitation() || this.isCandidateInvitation()) {
      this.form.get('role').clearValidators()
    } else {
      this.form.get('role').setValidators([Validators.required])
    }
    this.form.updateValueAndValidity()
  }

  /**
   * SET invitation period as per organization selection
   *
   * @param organization
   */
  setInvitationPeriodFormValue(organization: IOrganization) {
    this.form
      .get('invitationExpirationPeriod')
      .setValue(organization.inviteExpiryPeriod || InvitationExpirationEnum.TWO_WEEK)
    this.form.get('invitationExpirationPeriod').updateValueAndValidity()
  }

  onSelectionChange(role: IRole) {}

  ngOnDestroy() {
    this.emails.clear()
  }
}
