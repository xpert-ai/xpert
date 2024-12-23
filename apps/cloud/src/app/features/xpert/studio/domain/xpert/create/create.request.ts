import { IPoint, IXpert } from 'apps/cloud/src/app/@core'

export class CreateTeamRequest {
  constructor(
    public readonly position: IPoint,
    public readonly team?: IXpert
  ) {}
}
