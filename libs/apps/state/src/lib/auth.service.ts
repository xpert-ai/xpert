import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable } from '@angular/core'
import {
  IAuthResponse,
  IUser,
  IUserLoginInput,
  IUserRegistrationInput,
  PermissionsEnum,
  RolesEnum
} from '@xpert-ai/contracts'
import { Observable, firstValueFrom } from 'rxjs'
import { C_API_AUTH } from './constants'


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(private http: HttpClient) {}

  isAuthenticated(): Promise<boolean> {
    return firstValueFrom(this.http.get<boolean>(`${C_API_AUTH}/authenticated`))
  }

  login(loginInput: IUserLoginInput): Observable<IAuthResponse> {
    return this.http.post<IAuthResponse>(`${C_API_AUTH}/login`, loginInput)
  }

  logout() {
    // this.patchState({ isAuthenticated: false })
  }

  /**
   * Public user signup
   */
  signup(registerInput: IUserRegistrationInput): Observable<IUser> {
    return this.http.post<IUser>(`${C_API_AUTH}/signup`, registerInput)
  }

  register(registerInput: IUserRegistrationInput): Observable<IUser> {
    return this.http.post<IUser>(`${C_API_AUTH}/register`, registerInput)
  }

  requestPassword(requestPasswordInput): Observable<{ id?: string; token?: string }> {
    return this.http.post<IAuthResponse>(`${C_API_AUTH}/request-password`, requestPasswordInput)
  }

  resetPassword(resetPasswordInput) {
    return this.http.post(`${C_API_AUTH}/reset-password`, resetPasswordInput)
  }

  hasRole(roles: RolesEnum[]): Observable<boolean> {
    return this.http.get<boolean>(`${C_API_AUTH}/role`, {
      params: { roles }
    })
  }

  hasPermission(permission: PermissionsEnum): Observable<boolean> {
    return this.http.get<boolean>(`${C_API_AUTH}/permission`, {
      params: { permission }
    })
  }

  refreshAccessToken() {
    return this.http.get<{ token: string; refreshToken: string }>(`${C_API_AUTH}/refresh`)
  }

  verifyEmail(token: string) {
    return this.http.get(`${C_API_AUTH}/verify`, { params: new HttpParams().append('token', token) })
  }

  isAlive(): Observable<void> {
    return this.http.get<void>(`${C_API_AUTH}/alive`)
  }
}
