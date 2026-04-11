import { TestBed } from '@angular/core/testing';
import { OrganizationStatusService } from './organization-status.service';

describe('OrganizationStatusService', () => {
  let service: OrganizationStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(OrganizationStatusService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
