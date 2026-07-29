import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { XpCountdownComponent } from './countdown.component'
import { CountdownTimer } from './countdown.timer'

@NgModule({
  imports: [CommonModule],
  providers: [CountdownTimer],
  declarations: [XpCountdownComponent],
  exports: [XpCountdownComponent]
})
export class XpCountdownModule {}
