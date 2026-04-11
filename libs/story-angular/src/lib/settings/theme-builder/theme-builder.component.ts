import { DragDropModule } from '@angular/cdk/drag-drop'

import { Component, effect, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ButtonGroupDirective, NgmThemeService, ThemesEnum } from '@xpert-ai/ocap-angular/core'
import { EditorThemeMap } from '@xpert-ai/ocap-angular/formula'
import { TranslateModule } from '@ngx-translate/core'
import { MonacoEditorModule } from 'ngx-monaco-editor'
import { Z_MODAL_DATA, ZardButtonComponent, ZardDialogModule, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    DragDropModule,
    TranslateModule,
    ZardDialogModule,
    ZardButtonComponent,
    ZardIconComponent,
    MonacoEditorModule,
    ButtonGroupDirective
],
  selector: 'ngm-theme-builder',
  templateUrl: './theme-builder.component.html',
  styleUrls: ['./theme-builder.component.scss']
})
export class ThemeBuilderComponent {

  public readonly data = inject(Z_MODAL_DATA)
  readonly themeService = inject(NgmThemeService)

  c_light = ThemesEnum.light
  c_dark = ThemesEnum.dark

  activeLink = ThemesEnum.light

  editorOptions = { theme: 'vs', language: 'json' }
  statement = ''
  themes = {}
  error = ''

  constructor() {
    effect(() => {
      this.editorOptions = {
        ...this.editorOptions,
        theme: EditorThemeMap[this.themeService.themeClass()]
      }
    })
    
    this.themes = {...this.data}
    
    this.onActive(this.activeLink)
  }

  onActive(link: ThemesEnum) {
    this.activeLink = link
    if (this.themes[link]) {
      try {
        this.statement = JSON.stringify(this.themes[link])
      } catch (err) {
        this.statement = ''
      }
    } else {
      this.statement = ''
    }
  }

  onStatementChange(result: string) {
    this.error = ''
    if (result.trim()) {
      try {
        this.themes[this.activeLink] = JSON.parse(result)
      } catch (err: any) {
        this.error = err.message
      }
    } else {
      this.themes[this.activeLink] = null
    }
  }
}
