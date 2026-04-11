import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { CountdownComponent } from './countdown.component';
import { CountdownTimer } from './countdown.timer';

/**
 * @deprecated use `@xpert-ai/ocap-angular/common`
 */
@NgModule({
  imports: [CommonModule],
  providers: [CountdownTimer],
  declarations: [CountdownComponent],
  exports: [CountdownComponent],
})
export class CountdownModule {}
