import { ApplicationConfig } from '@angular/core';
import { provideZard } from '@xpert-ai/headless-ui';
 
export const appConfig: ApplicationConfig = {
  providers: [
    ...provideZard(),
  ]
};