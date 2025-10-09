import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal, TemplateRef, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { DisappearFadeOut, DynamicGridDirective } from '@metad/core'
import { NgmSelectComponent, NgmTagsComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { map, switchMap } from 'rxjs/operators'
import { EmailTemplateNameEnum } from '../../../@core/types'
import { EmailTemplateService, injectToastr, LanguagesService } from '../../../@core/services'
import { groupBy } from 'lodash-es'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { injectOrganization } from '@metad/cloud/state'
import { LanguagesEnum } from '@metad/contracts'
import { EmailTemplateComponent } from './template/template.component'
import { MatIconModule } from '@angular/material/icon'
import { MatButtonModule } from '@angular/material/button'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { BehaviorSubject, combineLatest } from 'rxjs'
import { CardCreateComponent } from '../../../@shared/card'
import { LanguageSelectorComponent } from '../../../@shared/language'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,

    MatIconModule,
    MatButtonModule,

    NgmSelectComponent,
    NgmTagsComponent,
    CardCreateComponent,
    DynamicGridDirective,
    ButtonGroupDirective,

    LanguageSelectorComponent,
    EmailTemplateComponent
  ],
  templateUrl: './email-templates.component.html',
  styleUrls: ['./email-templates.component.scss'],
  animations: [DisappearFadeOut]
})
export class EmailTemplatesComponent {
  readonly emailTemplateService = inject(EmailTemplateService)
  readonly languagesService = inject(LanguagesService)
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly organization = injectOrganization()

  // States
  readonly refresh$ = new BehaviorSubject<void>(null) 
  readonly emailTemplates = toSignal(
    this.refresh$.pipe(switchMap(() => this.emailTemplateService.getAllInOrg().pipe(map(({ items }) => items))))
  )
  readonly allLanguages = toSignal(
    this.refresh$.pipe(switchMap(() => this.languagesService.getAll().pipe(map(({items}) => items))))
  )

  readonly langGroup = computed(() => {
    const languages = groupBy(this.emailTemplates(), 'languageCode')
    return languages
  })
  readonly languages = computed(() => {
    const allLanguages = this.allLanguages()
    const languages = this.langGroup()
    return Object.keys(languages).map((l) => ({
      key: l,
      caption: allLanguages?.find((_) => _.code === l)?.name,
      color: ['red', 'green', 'blue', 'yellow', 'gray'][Math.floor(Math.random() * 5)]
    }))
  })

  readonly newTempl = viewChild('newTempl', { read: TemplateRef })

  readonly languageCodes = model([LanguagesEnum.English])
  get languageCode() {
    return this.languageCodes()[0]
  }
  set languageCode(value) {
    this.languageCodes.set([value])
  }
  readonly name = model<EmailTemplateNameEnum>(null)

  readonly templates = computed(() => {
    const items = this.langGroup()[this.languageCodes()[0]]
    if (!items) {
      return null
    }
    
    const g = groupBy(items.map((item) => ({
      ...item,
      name: item.name.split('/')[0],
      type: item.name.split('/')[1],
    })), 'name')
    return Object.keys(g).map((name) => ({
      name: name as EmailTemplateNameEnum,
      html: g[name].find((_) => _.type === 'html'),
      subject: g[name].find((_) => _.type === 'subject'),
    }))
  })

  readonly templateNames = signal(Object.values(EmailTemplateNameEnum).map((name) => ({
    key: name,
    caption: name
  })))

  readonly opened = signal(false)

  private dialogRef: DialogRef = null

  constructor() {
    effect(() => {
      // console.log(this.languageCodes())
    })
  }

  newEmailTemplate() {
    this.dialogRef = this.#dialog.open(this.newTempl(),)

    this.dialogRef.closed.subscribe({
      next: () => {
        //
      }
    })
  }

  async create() {
    this.opened.set(true)
    this.dialogRef.close()

    // try {
    //   await this.emailTemplateService.saveEmailTemplate({
    //     name: this.name(),
    //     languageCode: this.languageCodes()[0],
    //     mjml: null,
    //     subject: null
    //   })

    //   this.opened.set(true)
    // } catch(err) {
    //   this.#toastr.error(getErrorMessage(err))
    // }
  }

  open(name: EmailTemplateNameEnum) {
    this.name.set(name)
    this.opened.set(true)
  }

  edit(name: EmailTemplateNameEnum) {
    this.name.set(name)
    this.opened.set(true)
  }

  delete(item) {
    combineLatest([
      this.emailTemplateService.delete(item.subject.id),
      this.emailTemplateService.delete(item.html.id),
    ]).subscribe({
      next: () => {
        //
      }
    })
  }

  close() {
    this.opened.set(false)
    this.refresh$.next()
  }
}
