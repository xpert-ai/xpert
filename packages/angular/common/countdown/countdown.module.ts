import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { NgmCountdownComponent } from './countdown.component';
import { CountdownTimer } from './countdown.timer';

@NgModule({
  imports: [CommonModule],
  providers: [CountdownTimer],
  declarations: [NgmCountdownComponent],
  exports: [NgmCountdownComponent],
})
export class NgmCountdownModule {}
