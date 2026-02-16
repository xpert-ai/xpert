import { AnimationsService } from './animations.service';

describe('AnimationsService', () => {
  let service: AnimationsService;

  beforeEach(() => {
    service = new AnimationsService();
  });

  it('should set route animation type to "ALL" by default', () => {
    expect(AnimationsService.isRouteAnimationsType('ALL')).toBe(true);
  });

  it('should set route animation type to "ALL"', () => {
    service.updateRouteAnimationType(true, true);
    expect(AnimationsService.isRouteAnimationsType('ALL')).toBe(true);
  });

  it('should set route animation type to "PAGE"', () => {
    service.updateRouteAnimationType(true, false);
    expect(AnimationsService.isRouteAnimationsType('PAGE')).toBe(true);
  });

  it('should set route animation type to "ELEMENTS"', () => {
    service.updateRouteAnimationType(false, true);
    expect(AnimationsService.isRouteAnimationsType('ELEMENTS')).toBe(true);
  });
});
