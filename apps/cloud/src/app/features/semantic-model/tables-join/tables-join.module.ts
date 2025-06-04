import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDividerModule } from '@angular/material/divider'
import { MatIconModule } from '@angular/material/icon'
import { MatSelectModule } from '@angular/material/select'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

import { CdkMenuModule } from '@angular/cdk/menu'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TablesJoinComponent } from './tables-join.component'

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,

    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    MatButtonModule,
    TranslateModule,

    OcapCoreModule,
    NgmCommonModule
  ],
  exports: [TablesJoinComponent],
  declarations: [TablesJoinComponent],
  providers: []
})
export class TablesJoinModule {}
