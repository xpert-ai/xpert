import { HttpContextToken } from '@angular/common/http'

/** Keep the current access token, but do not refresh or retry authentication during logout cleanup. */
export const SKIP_AUTH_REFRESH = new HttpContextToken<boolean>(() => false)
