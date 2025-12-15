import { HttpClient } from '@angular/common/http'
import { Injectable } from '@angular/core'
import { IUser, IUserFindInput, IUserPasswordInput, IUserUpdateInput } from '@metad/contracts'
import { firstValueFrom, map } from 'rxjs'
import { API_PREFIX } from './constants'

@Injectable({
  providedIn: 'root'
})
export class UsersService {
  constructor(private http: HttpClient) {}

  API_URL = `${API_PREFIX}/user`

  getMe(relations?: string[]): Promise<IUser> {
    const data = JSON.stringify({ relations })

    return firstValueFrom(
      this.http.get<IUser>(`${this.API_URL}/me`, {
        params: { data }
      })
    )
  }

  getUserByEmail(emailId: string): Promise<IUser> {
    return firstValueFrom(this.http.get<IUser>(`${this.API_URL}/email/${emailId}`))
  }

  getUserById(id: string, relations?: string[]): Promise<IUser> {
    const data = JSON.stringify({ relations })
    return firstValueFrom(
      this.http.get<IUser>(`${this.API_URL}/${id}`, {
        params: { data }
      })
    )
  }

  getAll(relations?: string[], findInput?: IUserFindInput, search?: string) {
    const data = JSON.stringify({ relations, findInput, search })
    return this.http.get<{ items: IUser[]; total: number }>(`${this.API_URL}`, {
        params: { data }
      }).pipe(map(({items}) => items))
  }

  search(search: string) {
    return this.http.get<{ items: IUser[]; total: number }>(`${this.API_URL}/search`, {
        params: { search }
      }).pipe(
        map(({items}) => items)
      )
  }

  update(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/${userId}`, updateInput))
  }

  updateMe(updateInput: IUserUpdateInput) {
    return this.http.put<IUser>(`${this.API_URL}/me`, updateInput)
  }

  delete(userId: string,) {
    return this.http.delete(`${this.API_URL}/${userId}`)
  }

  password(userId: string, input: IUserPasswordInput) {
    return this.http.post(`${this.API_URL}/${userId}/password`, input)
  }

  deleteAllData(userId) {
    return firstValueFrom(this.http.delete(`${this.API_URL}/reset/${userId}`))
  }

  updatePreferredLanguage(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/preferred-language/${userId}`, updateInput))
  }

  updatePreferredComponentLayout(userId: string, updateInput: IUserUpdateInput) {
    return firstValueFrom(this.http.put(`${this.API_URL}/preferred-layout/${userId}`, updateInput))
  }

  createBulk(users: IUserUpdateInput[]) {
    return this.http.post<IUser[]>(this.API_URL + `/bulk`, users)
  }

  uploadAndParseCsv(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return this.http.post<IUserUpdateInput[]>(this.API_URL + `/bulk/upload`, formData)
  }
}
