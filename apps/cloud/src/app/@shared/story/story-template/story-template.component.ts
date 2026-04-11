import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmConfirmDeleteService, NgmHighlightDirective, NgmTagsComponent } from '@xpert-ai/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { find, sortBy, values } from 'lodash-es'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { debounceTime, map, startWith, switchMap } from 'rxjs/operators'
import { listAnimation, StoryTemplateType, StoryTemplateService, ToastrService, IStoryTemplate, ITag, getErrorMessage } from '../../../@core'
import { InlineSearchComponent } from '../../form-fields'
import { SharedUiModule } from '../../ui.module'
import { UserPipe } from '../../pipes'
import { TagViewerComponent } from '../../tag'

import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'pac-story-template',
  templateUrl: './story-template.component.html',
  styleUrls: ['story-template.component.scss'],
  providers: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    SharedUiModule,
    TranslateModule,
    ButtonGroupDirective,
    AppearanceDirective,
    DensityDirective,
    UserPipe,
    TagViewerComponent,
    NgmTagsComponent,
    InlineSearchComponent,
    NgmHighlightDirective
  ],
  animations: [listAnimation]
})
export class StoryTemplateComponent implements OnInit {
  StoryTemplateType = StoryTemplateType
  private readonly storyTemplateService = inject(StoryTemplateService)
  private readonly _confirmDelete = inject(NgmConfirmDeleteService)
  private readonly _dialogRef = inject(ZardDialogRef<StoryTemplateComponent>)
  private readonly _data = inject(Z_MODAL_DATA)
  private readonly _toastrService = inject(ToastrService)
  private readonly _cdr = inject(ChangeDetectorRef)

  searchControl = new FormControl()
  get highlight() {
    return this.searchControl.value
  }

  c_suggested = 'suggested'
  c_my = 'my'

  activedLink = this.c_suggested
  preview: IStoryTemplate | null = null

  _templates = new BehaviorSubject<IStoryTemplate[]>([])
  get templates() {
    return this._templates.value
  }
  set templates(value: IStoryTemplate[]) {
    this._templates.next(value)
  }
  tags: ITag[]
  myTemplates: IStoryTemplate[]
  myTags: ITag[]
  allTemplates: IStoryTemplate[]
  allTags: ITag[]

  selectedTags = new BehaviorSubject<string[]>([])
  templateTypes$ = new BehaviorSubject<string[]>([])
  get templateTypes() {
    return this.templateTypes$.value
  }
  set templateTypes(value: string[]) {
    this.templateTypes$.next(value)
  }

  get appliedTemplateId() {
    return this._data.templateId
  }

  public readonly templates$ = this._templates.pipe(
    switchMap((templates) =>
      this.searchControl.valueChanges.pipe(
        startWith(''),
        debounceTime(300),
        map((search) => {
          search = search?.trim().toLowerCase()
          return search ? templates.filter((template) => template.name.toLowerCase().includes(search)) : templates
        })
      )
    ),
    switchMap((templates) =>
      this.templateTypes$.pipe(
        map((types) => (types?.length ? templates.filter((template) => types.includes(template.type)) : templates))
      )
    ),
    switchMap((templates) => this.selectedTags.pipe(map((tags) => this.filterTemplates(templates, tags))))
  )

  ngOnInit() {
    this.activeLink(this.c_suggested)
  }

  refresh() {
    this.getMy()
  }

  trackById(index: number, item: any) {
    return item.id
  }

  async useTemplate(id: string) {
    const template: IStoryTemplate = await firstValueFrom(this.storyTemplateService.getOne(id))
    this._dialogRef.close(template)
  }

  activeLink(link: string) {
    this.activedLink = link
    if (this.activedLink === this.c_my) {
      if (!this.myTemplates) {
        this.templates = []
        this.getMy()
      } else {
        this.templates = this.myTemplates
        this.tags = this.myTags
      }
    } else if (this.activedLink === this.c_suggested) {
      if (!this.allTemplates) {
        this.templates = []
        this.getAll()
      } else {
        this.templates = this.allTemplates
        this.tags = this.allTags
      }
    }
  }

  getAll() {
    this.storyTemplateService
      .getAllPublic()
      .pipe(map(({ items }) => items))
      .subscribe((templates) => {
        this.allTemplates = templates
        this.allTags = aggregateTemplateTags(templates)
        this.templates = templates
        this.tags = this.allTags
        this._cdr.detectChanges()
      })
  }

  getMy() {
    this.storyTemplateService
      .getMy()
      .pipe(map(({ items }) => items))
      .subscribe((templates) => {
        this.myTemplates = templates
        this.myTags = aggregateTemplateTags(templates)
        this.templates = templates
        this.tags = this.myTags
        this._cdr.detectChanges()
      })
  }

  onTagsChange(tags: string[]) {
    this.selectedTags.next(tags)
  }

  filterTemplates(templates: IStoryTemplate[], tags: string[]) {
    return templates.filter((template) => {
      return tags.length === 0 || tags.every((tag) => find(template.tags, (item) => item.name === tag))
    })
  }

  async deleteTemplate(template: IStoryTemplate) {
    const confirm = await firstValueFrom(this._confirmDelete.confirm({ value: template.name }))
    if (confirm) {
      try {
        await firstValueFrom(this.storyTemplateService.delete(template.id))
        this._toastrService.success('Story.Template.TemplateDelete', { Default: 'Template delete' })
        this.refresh()
      } catch (error) {
        this._toastrService.error(getErrorMessage(error))
      }
    }
  }
}

export function aggregateTemplateTags(templates: IStoryTemplate[]) {
  return sortBy(
    values(
      templates.reduce(
        (acc, curr) => {
          curr.tags.forEach((tag) => {
            if (acc[tag.name]) {
              acc[tag.name].count = acc[tag.name].count + 1
            } else {
              acc[tag.name] = {
                count: 1,
                tag
              }
            }
          })
          return acc
        },
        <
          Record<
            string,
            {
              count: number
              tag: ITag
            }
          >
        >{}
      )
    ),
    'count'
  )
    .reverse()
    .map(({ tag }) => tag)
}
