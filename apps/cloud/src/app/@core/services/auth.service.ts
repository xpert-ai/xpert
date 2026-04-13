// import { HttpClient } from '@angular/common/http'
// import { Injectable } from '@angular/core'
// import { ComponentStore } from '@xpert-ai/store'
// import {
//   IUserLoginInput,
//   IAuthResponse,
//   IUser,
//   IUserRegistrationInput,
//   PermissionsEnum,
//   RolesEnum
// } from '@xpert-ai/contracts'
// import { lastValueFrom, Observable, of } from 'rxjs'
// import { first, switchMap, tap } from 'rxjs/operators'
// import { API_PREFIX } from '@xpert-ai/cloud/state'

// export interface AuthState {
//   inited: boolean
//   isAuthenticated: boolean
// }

// @Injectable()
// export class AuthService extends ComponentStore<AuthState> {

//   public readonly isAuthenticated$ = this.select((state) => state.isAuthenticated).pipe(
//     switchMap((isAuthenticated) => {
//       if (isAuthenticated) {
//         return of(isAuthenticated)
//       } else {
//         return this.http
//           .get<boolean>(`${API_PREFIX}/auth/authenticated`)
//           .pipe(tap((isAuthenticated) => this.patchState({ isAuthenticated })))
//       }
//     })
//   )

//   constructor(private http: HttpClient) {
//     super({} as AuthState)
//   }

//   isAuthenticated(): Promise<boolean> {
//     return lastValueFrom(this.http.get<boolean>(`${API_PREFIX}/auth/authenticated`).pipe(first()))
//   }

//   login(loginInput: IUserLoginInput): Observable<IAuthResponse> {
//     return this.http.post<IAuthResponse>(`${API_PREFIX}/auth/login`, loginInput)
//   }

//   logout() {
//     this.patchState({ isAuthenticated: false })
//   }

//   /**
//    * Public user signup
//    */
//   signup(registerInput: IUserRegistrationInput): Observable<IUser> {
//     return this.http.post<IUser>(`${API_PREFIX}/auth/signup`, registerInput)
//   }

//   register(registerInput: IUserRegistrationInput): Observable<IUser> {
//     return this.http.post<IUser>(`${API_PREFIX}/auth/register`, registerInput)
//   }

//   requestPassword(requestPasswordInput): Observable<{ id?: string; token?: string }> {
//     return this.http.post<IAuthResponse>(`${API_PREFIX}/auth/request-password`, requestPasswordInput)
//   }

//   resetPassword(resetPasswordInput) {
//     return this.http.post(`${API_PREFIX}/auth/reset-password`, resetPasswordInput)
//   }

//   hasRole(roles: RolesEnum[]): Observable<boolean> {
//     return this.http.get<boolean>(`${API_PREFIX}/auth/role`, {
//       params: { roles }
//     })
//   }

//   hasPermission(permission: PermissionsEnum): Observable<boolean> {
//     return this.http.get<boolean>(`${API_PREFIX}/auth/permission`, {
//       params: { permission }
//     })
//   }

//   refreshAccessToken() {
//     return this.http.get<{token: string, refreshToken: string}>(`${API_PREFIX}/auth/refresh`)
//   }
// }
