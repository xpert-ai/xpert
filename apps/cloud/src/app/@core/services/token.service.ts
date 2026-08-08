import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class XpTokenService {
  get csrfToken() {
    const cookies = document.cookie.split('; ')
    const csrfToken = cookies.map((cookie) => cookie.split('=')).find(([name, value]) => name === 'csrf_token')
    return csrfToken?.[1]
  }
}
