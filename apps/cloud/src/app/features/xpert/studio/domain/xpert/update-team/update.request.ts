import { IXpert } from 'apps/cloud/src/app/@core'

export class UpdateXpertTeamRequest {
  constructor(public readonly xpert: Partial<IXpert>) {}
}
