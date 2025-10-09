export class RemoveConnectionRequest {
  constructor(
    public readonly sourceId: string,
    public readonly targetId: string
  ) {
  }
}
