import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import * as Sentry from "@sentry/angular";
import { BrowserTracing } from "@sentry/tracing";
import 'hammerjs';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { enableAkitaProdMode, persistState, akitaConfig } from '@datorama/akita';


// Sentry.init({
//   dsn: "https://ceec859e3292454e86c5fe2fc2685c57@o4504752442507264.ingest.sentry.io/4504752446636032",
//   integrations: [
//     new BrowserTracing({
//       tracePropagationTargets: ["localhost", "https://app.mtda.cloud/"],
//       routingInstrumentation: Sentry.routingInstrumentation,
//     }),
//   ],

//   // Set tracesSampleRate to 1.0 to capture 100%
//   // of transactions for performance monitoring.
//   // We recommend adjusting this value in production
//   tracesSampleRate: 0,
// });

if (environment.production) {
  enableProdMode();
  enableAkitaProdMode();
}

persistState({
	key: '_pangolinStore'
});

akitaConfig({
	resettable: true
});

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch((err) => console.error(err));

console.log(`
██╗  ██╗██████╗ ███████╗██████╗ ████████╗     █████╗ ██╗
╚██╗██╔╝██╔══██╗██╔════╝██╔══██╗╚══██╔══╝    ██╔══██╗██║
 ╚███╔╝ ██████╔╝█████╗  ██████╔╝   ██║       ███████║██║
 ██╔██╗ ██╔═══╝ ██╔══╝  ██╔══██╗   ██║       ██╔══██║██║
██╔╝ ██╗██║     ███████╗██║  ██║   ██║       ██║  ██║██║
╚═╝  ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝       ╚═╝  ╚═╝╚═╝`)
console.log('VERSION:', environment.version);

console.log(`We're hiring! https://xpertai.cn/jobs`)