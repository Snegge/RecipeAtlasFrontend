import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SwUpdate } from '@angular/service-worker';
import { PwaService } from './pwa.service';

describe('PWA lifecycle', () => {
  it('announces ready and unrecoverable versions without activating or reloading', () => {
    const versions = new Subject<unknown>(),
      broken = new Subject<unknown>();
    const activateUpdate = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates: versions,
            unrecoverable: broken,
            checkForUpdate: () => Promise.resolve(false),
            activateUpdate,
          },
        },
      ],
    });
    const service = TestBed.inject(PwaService);
    versions.next({ type: 'VERSION_READY' });
    expect(service.update()).toBe('ready');
    service.update.set(null);
    broken.next({ reason: 'missing chunk' });
    expect(service.update()).toBe('broken');
    expect(activateUpdate).not.toHaveBeenCalled();
  });
  it('uses online as a hint without clearing a failed server request', () => {
    const service = TestBed.inject(PwaService);
    service.connectionFailed.set(true);
    window.dispatchEvent(new Event('offline'));
    expect(service.offline()).toBe(true);
    window.dispatchEvent(new Event('online'));
    expect(service.offline()).toBe(false);
    expect(service.connectionFailed()).toBe(true);
    TestBed.resetTestingModule();
    window.dispatchEvent(new Event('offline'));
    expect(service.offline()).toBe(false);
  });
});
