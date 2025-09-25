export class CreateConnectionRequest {
  constructor(
    public readonly connection: {sourceId: string; targetId: string},
  ) {
  }
}
