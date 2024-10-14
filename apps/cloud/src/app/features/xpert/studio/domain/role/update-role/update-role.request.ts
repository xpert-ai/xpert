import { IXpertRole } from "apps/cloud/src/app/@core";

export class UpdateRoleRequest {

  constructor(
    public readonly key: string,
    public readonly entity: Partial<IXpertRole>,
  ) {
  }
}