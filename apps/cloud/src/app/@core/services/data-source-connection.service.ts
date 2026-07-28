import { Injectable, inject } from '@angular/core'
import { DataSourceAuthenticationInput, DataSourcePingInput, DataSourceService } from '@xpert-ai/cloud/state'
import { AuthenticationEnum } from '@xpert-ai/contracts'
import { ZardSheetService } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { AuthInfoType, BottomSheetBasicAuthComponent } from '../auth'

@Injectable({
  providedIn: 'root'
})
export class DataSourceConnectionService {
  readonly #dataSourceService = inject(DataSourceService)
  readonly #sheetService = inject(ZardSheetService)

  async ping(dataSource: DataSourcePingInput): Promise<unknown> {
    if (dataSource.authType !== AuthenticationEnum.BASIC) {
      return this.executePing(dataSource)
    }

    const authentication = await this.resolveAuthentication(dataSource)
    if (!authentication) {
      throw new Error('XP.MESSAGE.UserAuthenticationFailure')
    }

    if (dataSource.id) {
      return this.executePing(dataSource)
    }

    return this.executePing({
      ...dataSource,
      authentications: [authentication]
    })
  }

  private async resolveAuthentication(
    dataSource: DataSourcePingInput
  ): Promise<DataSourceAuthenticationInput | undefined> {
    if (dataSource.id) {
      try {
        const existing = await firstValueFrom(this.#dataSourceService.getAuthentication(dataSource.id))
        if (existing) {
          return existing
        }
      } catch {
        // Missing saved credentials should fall through to the authentication prompt.
      }
    }

    const authentication = await this.promptForAuthentication(dataSource)
    if (authentication && dataSource.id) {
      await firstValueFrom(this.#dataSourceService.createAuthentication(dataSource.id, authentication))
    }

    return authentication
  }

  private promptForAuthentication(dataSource: DataSourcePingInput): Promise<AuthInfoType | undefined> {
    return firstValueFrom(
      this.#sheetService
        .open(BottomSheetBasicAuthComponent, {
          zData: {
            name: dataSource.name ?? '',
            ping: (authentication: AuthInfoType) =>
              this.executePing({
                ...dataSource,
                authentications: [authentication]
              })
          },
          zSide: 'bottom',
          zHideFooter: true,
          zClosable: false
        })
        .afterClosed()
    )
  }

  private executePing(dataSource: DataSourcePingInput): Promise<unknown> {
    return firstValueFrom(
      dataSource.id ? this.#dataSourceService.ping(dataSource.id, dataSource) : this.#dataSourceService.ping(dataSource)
    )
  }
}
