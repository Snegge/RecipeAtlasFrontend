import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CookbooksModule } from './cookbooks.module';
import { CookbookOverviewComponent } from './cookbook-overview.component';
import { CookbookSettingsComponent } from './cookbook-settings.component';
import { CookbookService } from '../../core/services/cookbook.service';
import { CookbookContext } from '../../core/services/cookbook-context';
import { SessionState } from '../../core/services/session-state';

describe('Cookbook selection and role controls', () => {
  const books = ['Owner', 'Editor', 'Viewer'].map((role, index) => ({
    id: 'book-' + index,
    name: role + ' cookbook',
    role,
  }));
  const rename = vi.fn();
  const select = vi.fn();
  beforeEach(async () => {
    rename.mockReset().mockResolvedValue(undefined);
    select.mockReset();
    await TestBed.configureTestingModule({
      imports: [CookbooksModule],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({}),
              paramMap: convertToParamMap({ cookbookId: 'book-0' }),
            },
          },
        },
        {
          provide: CookbookService,
          useFactory: () => ({
            context: TestBed.inject(CookbookContext),
            list: () => of(books),
            create: vi.fn().mockResolvedValue({ id: 'created', name: 'Created', role: 'Owner' }),
            members: vi.fn().mockResolvedValue([
              {
                userId: 'alice',
                username: 'alice',
                displayName: 'Alice',
                role: 'Owner',
                isActive: true,
              },
              {
                userId: 'bob',
                username: 'bob',
                displayName: 'Bob',
                role: 'Viewer',
                isActive: true,
              },
            ]),
            rename,
            select,
          }),
        },
      ],
    }).compileComponents();
  });
  it('links every accessible cookbook and reserves settings for its owner', async () => {
    const fixture = TestBed.createComponent(CookbookOverviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards.length).toBe(3);
    for (let index = 0; index < 3; index++) {
      expect(cards[index].querySelector('a').getAttribute('href')).toBe(
        '/cookbooks/book-' + index + '/recipes',
      );
      expect(cards[index].textContent.includes('Members and settings')).toBe(index === 0);
      expect(cards[index].textContent.includes('Leave cookbook')).toBe(index !== 0);
    }
    expect(cards[2].textContent).toContain('Read-only');
    TestBed.inject(SessionState).clear('logout');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('article').length).toBe(0);
  });
  it('navigates to the newly created cookbook', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CookbookOverviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.form.controls.name.setValue('Created');
    await fixture.componentInstance.create();
    expect(navigate).toHaveBeenCalledWith(['/cookbooks', 'created', 'recipes']);
  });
  it('offers member changes for Viewer/Editor, never for the permanent owner', async () => {
    TestBed.inject(CookbookContext).current.set(books[0]);
    const fixture = TestBed.createComponent(CookbookSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('article');
    expect(cards[0].querySelector('button')).toBeNull();
    expect(cards[1].textContent).toContain('Make Editor');
    expect(cards[1].textContent).toContain('Remove member');
  });
  it('does not reselect the previous user’s cookbook after a rename continuation', async () => {
    let finish!: () => void;
    rename.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    TestBed.inject(CookbookContext).current.set(books[0]);
    const fixture = TestBed.createComponent(CookbookSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.componentInstance.name.controls.name.setValue('Private name');
    const saving = fixture.componentInstance.rename();
    TestBed.inject(SessionState).clear('login');
    finish();
    await saving;
    expect(select).not.toHaveBeenCalled();
    expect(fixture.componentInstance.members()).toEqual([]);
  });
});
