import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { AbilityModule } from '@casl/angular'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { MaterialModule } from './material.module'
import { CreatedByPipe, UserPipe } from './pipes/index'
import { TagEditorComponent, TagViewerComponent } from './tag'
import { CdkMenuModule } from '@angular/cdk/menu'

const Modules = [TranslateModule, FormsModule, ReactiveFormsModule, AbilityModule, OcapCoreModule]

/**
 * @deprecated
 */
@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    RouterModule,
    MaterialModule,
    ...Modules,
    CdkMenuModule,
    CreatedByPipe,
    UserPipe,
    TagEditorComponent,
    TagViewerComponent
  ],
  exports: [
    CommonModule,
    RouterModule,
    MaterialModule,
    ...Modules,
    CdkMenuModule,
    UserPipe,
    CreatedByPipe,
    TagEditorComponent,
    TagViewerComponent
  ],
  providers: []
})
export class SharedModule {}
