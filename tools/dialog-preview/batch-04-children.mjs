// Local form adapters avoid authentication and business APIs. Parent Dialog templates and UI controls are production sources.
import { Component, EventEmitter, forwardRef } from '@angular/core'
import { NG_VALUE_ACCESSOR } from '@angular/forms'
import { formOf } from './batch-04-fixtures.mjs'
export function batchFourChildren(imports, templates) {
  class OrganizationForm {
    basic = formOf({ name: '研究团队', currency: 'CNY', defaultValueDateType: 'TODAY' })
    orgSettingsForm = formOf({ invitesAllowed: true, inviteExpiryPeriod: 7 })
    writeValue() {}
    registerOnChange() {}
    registerOnTouched() {}
  }
  Component({
    selector: 'xp-organization-step-form',
    standalone: true,
    imports,
    template: templates.organizationForm,
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => OrganizationForm), multi: true }]
  })(OrganizationForm)
  class UserForm {
    password = true
    isAdmin = true
    isSuperAdmin = false
    validityChange = new EventEmitter()
    fields = ['First name', 'Last name', 'Username', 'Email', 'Password', 'Confirm password']
  }
  Component({
    selector: 'xp-user-basic-info-form',
    standalone: true,
    inputs: ['password', 'isAdmin', 'isSuperAdmin'],
    outputs: ['validityChange'],
    imports,
    template: `<div class="grid gap-4 sm:grid-cols-2">@for (label of fields; track label) { <label class="space-y-2"><span>{{ label }}</span><input z-input class="w-full" [attr.aria-label]="label" /></label> }<label class="space-y-2"><span>Role</span><z-select zPlaceholder="Select role"><z-select-item zValue="user">User</z-select-item></z-select></label><label class="space-y-2"><span>Language</span><z-select zPlaceholder="Select language"><z-select-item zValue="zh">中文</z-select-item></z-select></label></div>`
  })(UserForm)
  class InviteForm {
    invitationType = ''
    form = formOf({ emails: [], role: 'user' })
  }
  Component({
    selector: 'xp-email-invite-form',
    standalone: true,
    inputs: ['invitationType'],
    imports,
    template: `<div class="space-y-4" [formGroup]="form"><label class="block space-y-2"><span>Email</span><z-tag-select mode="multiple" formControlName="emails" placeholder="user@example.com" /></label><label class="block space-y-2"><span>Role</span><z-select formControlName="role"><z-select-item zValue="user">User</z-select-item></z-select></label></div>`
  })(InviteForm)
  class BasicForm {
    name = ''
    title = ''
    description = ''
    avatar = null
    copilotModel = null
    nameChange = new EventEmitter()
    titleChange = new EventEmitter()
    descriptionChange = new EventEmitter()
    avatarChange = new EventEmitter()
    copilotModelChange = new EventEmitter()
    invalid = () => false
    checking = () => false
  }
  Component({
    selector: 'xpert-basic-form',
    standalone: true,
    inputs: ['name', 'title', 'description', 'avatar', 'copilotModel'],
    outputs: ['nameChange', 'titleChange', 'descriptionChange', 'avatarChange', 'copilotModelChange'],
    imports,
    template: `<div class="space-y-4"><label class="block space-y-2"><span>ID</span><input z-input class="w-full" [ngModel]="name" (ngModelChange)="nameChange.emit($event)" /></label><label class="block space-y-2"><span>Name</span><input z-input class="w-full" [ngModel]="title" (ngModelChange)="titleChange.emit($event)" /></label><label class="block space-y-2"><span>Model</span><z-select zPlaceholder="Select model"><z-select-item zValue="preview">Preview model</z-select-item></z-select></label><label class="block space-y-2"><span>Description</span><textarea z-input class="w-full" [ngModel]="description" (ngModelChange)="descriptionChange.emit($event)"></textarea></label></div>`
  })(BasicForm)
  return [OrganizationForm, UserForm, InviteForm, BasicForm]
}
