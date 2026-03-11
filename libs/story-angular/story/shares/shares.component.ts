import { Clipboard } from '@angular/cdk/clipboard'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { HttpParams } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, Inject, OnInit, TemplateRef, ViewChild, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import { ZardButtonComponent, ZardFormImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatSliderModule } from '@angular/material/slider'
import { MatSnackBar } from '@angular/material/snack-bar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { DomSanitizer, SafeUrl } from '@angular/platform-browser'
import { AccessEnum, ISemanticModel, Visibility } from '@metad/contracts'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { NX_STORY_STORE, NxStoryService, NxStoryStore, StoryPoint, StoryWidget } from '@metad/story/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule, ...ZardFormImports, ZardInputDirective, ZardButtonComponent, ZardIconComponent, MatTooltipModule, MatSlideToggleModule, MatSliderModule, TranslateModule, NgmCommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-shares-dialog',
  templateUrl: 'shares.component.html',
  styleUrls: ['shares.component.scss']
})
export class StorySharesComponent implements OnInit {
  Visibility = Visibility
  AccessEnum = AccessEnum

  private readonly _snackBar = inject(MatSnackBar)

  readonly visibilities = [Visibility.Public, Visibility.Private]
  _applicationBaseUrl = window.location.origin
  readonly baseUrl = signal<string>(null)
  readonly visibility = model(Visibility.Private)
  visibilityDisabled = false
  readonly isSecret = model(false)
  readonly expires = model(60 * 10)
  readonly pageKey = model<string>(null)
  readonly secret = signal<string>(null)

  readonly applicationUrl = computed(() => {
    if (!this.baseUrl()) return

    const queryParams = {}

    if (this.pageKey()) {
      queryParams['pageKey'] = this.pageKey()
    }
    if (this.isSecret() && this.secret()) {
      queryParams['token'] = this.secret()
    }
    const query = new HttpParams({ fromObject: queryParams }).toString()
    return this.baseUrl() + (query ? `?${query}` : '')
  })

  _embedBaseUrl = window.location.origin + '/public/'
  _embedUrl = ''
  showPreview = false

  embedUrl: SafeUrl

  get isStory() {
    return !(this.data?.point || this.data?.widget)
  }

  @ViewChild('copyMessage') copyMessage: TemplateRef<any>

  private readonly pages = this.storyService.displayPoints
  public readonly pagesSelectOptions = computed(() => {
    const pages = [
      {
        key: null,
        caption: this.getTranslation('Story.Shares.Default', { Default: 'Default' })
      }
    ]

    this.pages()?.forEach((point) => {
      pages.push({
        key: point.key,
        caption: point.name
      })
    })

    return pages
  })
  constructor(
    private storyService: NxStoryService,
    protected _sanitizer: DomSanitizer,

    @Inject(NX_STORY_STORE)
    private storyStore: NxStoryStore,

    @Inject(MAT_DIALOG_DATA)
    public data: {
      // story id
      id: string
      widget?: StoryWidget
      point?: StoryPoint
      visibility: Visibility
      isAuthenticated: boolean
      access: AccessEnum
      models: ISemanticModel[]
    },

    private clipboard: Clipboard,
    private translateService: TranslateService
  ) {
    this.visibilityDisabled = !this.isStory
  }

  ngOnInit() {
    this.visibility.set(this.data.visibility)

    if (this.visibilityDisabled && (!this.visibility() || this.visibility() === Visibility.Public)) {
      this.generate()
    }
  }

  togglePreview() {
    this.showPreview = !this.showPreview
    if (this.showPreview) {
      this.embedUrl = this._sanitizer.bypassSecurityTrustResourceUrl(this.applicationUrl())
    }
  }

  async generate() {
    if (this.visibility() !== this.data.visibility) {
      // Check semantic model visibility first
      if (this.visibility() === Visibility.Public && this.data.models.some((m) => m.visibility !== Visibility.Public)) {
        this._snackBar.open(
          this.getTranslation('Story.Shares.SemanticModelPublicFirst', {
            Default: 'Change semantic model to public visibility first!'
          }),
          '',
          {
            duration: 5000
          }
        )
        return
      }
      await firstValueFrom(
        this.storyStore.putStory(this.data.id, {
          visibility: this.visibility()
        })
      )
      const changedText = this.getTranslation('Story.Shares.VisibilityChanged', { Default: 'Visibility changed' })
      this._snackBar.open(changedText + '!', '', { duration: 2000 })
      this.storyService.updateStory({
        visibility: this.visibility()
      })
    }

    this.baseUrl.set(this.generateUrl())
    if (this.isSecret()) {
      const token = await firstValueFrom(
        this.storyStore.shareToken(
          this.data.id,
          this.expires() > 0
            ? {
                minutes: this.expires()
              }
            : null
        )
      )
      this.secret.set(token)
    }
  }

  generateUrl() {
    const baseUrl =
      !this.visibility() || this.visibility() === Visibility.Public
        ? this._applicationBaseUrl + '/public'
        : this._applicationBaseUrl
    if (this.data.widget) {
      return baseUrl + '/story/widget/' + this.data.widget.id
    } else if (this.data.point) {
      return baseUrl + '/story/point/' + this.data.point.id
    } else {
      return baseUrl + '/story/' + this.data.id
    }
  }

  copy(text: string) {
    this.clipboard.copy(text)
    this._snackBar.openFromTemplate(this.copyMessage, { duration: 2000 })
  }

  getTranslation(key: string, params?: any) {
    let t = ''
    this.translateService.get(key, params).subscribe((value) => {
      t = value
    })

    return t
  }
}
