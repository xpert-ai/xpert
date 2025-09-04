export class IntegrationAuthorizedEvent {
  constructor(
    public readonly payload: {
      provider: string;
      projectId?: string;
      [key: string]: any; // Allow additional properties
    },
  ) {}
}
