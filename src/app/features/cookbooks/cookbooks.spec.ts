import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatMenuTrigger } from '@angular/material/menu';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CookbooksModule } from './cookbooks.module';
import { CookbookOverviewComponent } from './pages/cookbook-overview/cookbook-overview.component';
import { CookbookEditorComponent } from './pages/cookbook-editor/cookbook-editor.component';
import { CookbookInvitationsComponent } from './components/cookbook-invitations/cookbook-invitations.component';
import { CookbookService } from '../../core/services/cookbook.service';
import { CookbookContext } from '../../core/services/cookbook-context';
import { SessionState } from '../../core/services/session-state';
const books = ['Owner', 'Editor', 'Viewer'].map((role, index) => ({
  id: 'book-' + index,
  name: role + ' cookbook',
  role,
  description: null,
  imageUrl: null,
  recipeCount: 2,
}));
const inbox = Array.from({ length: 6 }, (_, i) => ({
  id: 'invite-' + i,
  cookbookId: 'shared-' + i,
  cookbookName: 'Shared ' + i,
  role: 'Viewer',
  ownerDisplayName: 'Alice',
  ownerAvatarUrl: null,
  imageUrl: null,
}));
describe('Cookbook shelf, consent and editor', () => {
  const create = vi.fn(),
    rename = vi.fn(),
    select = vi.fn(),
    remove = vi.fn(),
    respond = vi.fn(),
    invitations = vi.fn(),
    upload = vi.fn();
  const route = {
    snapshot: {
      queryParamMap: convertToParamMap({}),
      paramMap: convertToParamMap({ cookbookId: 'book-0' }),
      data: { create: false },
    },
  };
  beforeEach(async () => {
    route.snapshot.data.create = false;
    create.mockReset().mockResolvedValue({ ...books[0], id: 'created' });
    rename.mockReset().mockResolvedValue(undefined);
    select.mockReset().mockResolvedValue(books[0]);
    remove.mockReset().mockResolvedValue(undefined);
    respond.mockReset().mockResolvedValue(undefined);
    invitations.mockReset().mockResolvedValue([]);
    upload.mockReset().mockResolvedValue(books[0]);
    await TestBed.configureTestingModule({
      imports: [CookbooksModule],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: route },
        {
          provide: CookbookService,
          useFactory: () => ({
            context: TestBed.inject(CookbookContext),
            list: () => of(books),
            create,
            rename,
            select,
            delete: remove,
            leave: vi.fn().mockResolvedValue(undefined),
            respond,
            invitations,
            upload,
            members: vi.fn().mockResolvedValue([
              {
                userId: 'alice',
                username: 'alice',
                displayName: 'Alice',
                role: 'Owner',
                isActive: true,
                avatarUrl: null,
                isPending: false,
              },
              {
                userId: 'bob',
                username: 'bob',
                displayName: 'Bob',
                role: 'Viewer',
                isActive: true,
                avatarUrl: null,
                isPending: true,
              },
            ]),
          }),
        },
      ],
    }).compileComponents();
  });
  it('renders clickable cards and role-specific action menus, then clears on logout', async () => {
    const fixture = TestBed.createComponent(CookbookOverviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const cards = fixture.nativeElement.querySelectorAll('.cookbook-card');
    expect(cards.length).toBe(3);
    for (let i = 0; i < 3; i++)
      expect(cards[i].querySelector('a').getAttribute('href')).toBe(
        '/cookbooks/book-' + i + '/recipes',
      );
    const triggers = fixture.debugElement.queryAll(By.directive(MatMenuTrigger));
    for (let i = 0; i < 3; i++) {
      const trigger = triggers[i].injector.get(MatMenuTrigger);
      trigger.openMenu();
      await fixture.whenStable();
      const text = document.getElementById(trigger.menu!.panelId!)?.textContent;
      expect(text?.includes('Delete cookbook')).toBe(i === 0);
      expect(text?.includes('Leave cookbook')).toBe(i !== 0);
      trigger.closeMenu();
    }
    expect(fixture.nativeElement.querySelector('a[href="/cookbooks/new"]')).not.toBeNull();
    TestBed.inject(SessionState).clear('logout');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.cookbook-card').length).toBe(0);
  });
  it('requires a separate confirmation before permanent deletion', async () => {
    const confirm = vi
      .spyOn(MatDialog.prototype, 'open')
      .mockReturnValue({ afterClosed: () => of(false), close: vi.fn() } as never);
    const fixture = TestBed.createComponent(CookbookOverviewComponent);
    await fixture.whenStable();
    await fixture.componentInstance.delete(books[0]);
    expect(remove).not.toHaveBeenCalled();
    expect((confirm.mock.calls[0][1]?.data as { message: string }).message).toContain(
      'all 2 recipes',
    );
    confirm.mockReturnValue({ afterClosed: () => of(true), close: vi.fn() } as never);
    await fixture.componentInstance.delete(books[0]);
    expect(remove).toHaveBeenCalledExactlyOnceWith('book-0');
  });
  it('creates a cookbook with staged invitations on its own page', async () => {
    route.snapshot.data.create = true;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(CookbookEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.componentInstance.form.controls.name.setValue('Created');
    fixture.componentInstance.member.setValue({ username: 'bob', role: 'Viewer' });
    await fixture.componentInstance.add();
    expect(create).not.toHaveBeenCalled();
    await fixture.componentInstance.save();
    expect(create).toHaveBeenCalledWith('Created', null, [{ username: 'bob', role: 'Viewer' }]);
    expect(navigate).toHaveBeenCalledWith(['/cookbooks', 'created', 'recipes']);
  });
  it('retains the created ID when picture upload fails and does not create a duplicate on retry', async () => {
    route.snapshot.data.create = true;
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    upload.mockRejectedValueOnce(new Error('Picture failed'));
    const fixture = TestBed.createComponent(CookbookEditorComponent);
    const page = fixture.componentInstance;
    page.form.controls.name.setValue('Picture book');
    page.picture.blob = new Blob(['picture']);
    page.picture.changed.set(true);
    await page.save();
    expect(page.savedId()).toBe('created');
    expect(page.error()).toContain('same cookbook');
    expect(page.hasUnsavedChanges()).toBe(true);
    await page.save();
    expect(create).toHaveBeenCalledTimes(1);
    expect(rename).toHaveBeenCalledWith('created', 'Picture book', null);
    expect(upload).toHaveBeenCalledTimes(2);
  });
  it('does not offer owner removal and labels pending membership separately', async () => {
    const fixture = TestBed.createComponent(CookbookEditorComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.componentInstance.load();
    fixture.detectChanges();
    const rows = fixture.nativeElement.querySelectorAll('.member-row');
    expect(rows[0].querySelector('button')).toBeNull();
    expect(rows[1].textContent).toContain('Invitation pending');
    expect(rows[1].querySelector('button').getAttribute('aria-label')).toContain(
      'Cancel invitation',
    );
  });
  it('ignores an old rename continuation after switching accounts', async () => {
    let finish!: () => void;
    rename.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const fixture = TestBed.createComponent(CookbookEditorComponent);
    await fixture.whenStable();
    select.mockClear();
    fixture.componentInstance.form.controls.name.setValue('Private name');
    const saving = fixture.componentInstance.save();
    TestBed.inject(SessionState).clear('login');
    finish();
    await saving;
    expect(select).not.toHaveBeenCalled();
    expect(fixture.componentInstance.members()).toEqual([]);
  });
  it('hides an empty invitation list, shows at most five and refills after a response', async () => {
    const empty = TestBed.createComponent(CookbookInvitationsComponent);
    empty.detectChanges();
    await empty.whenStable();
    empty.detectChanges();
    expect(empty.nativeElement.querySelector('section')).toBeNull();
    empty.destroy();
    invitations.mockResolvedValueOnce(inbox).mockResolvedValueOnce(inbox.slice(1));
    const fixture = TestBed.createComponent(CookbookInvitationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.cookbook-invitation').length).toBe(5);
    await fixture.componentInstance.respond(inbox[0], true);
    fixture.detectChanges();
    expect(respond).toHaveBeenCalledExactlyOnceWith('invite-0', true);
    expect(fixture.componentInstance.invitations().map((x) => x.id)).toEqual(
      inbox.slice(1).map((x) => x.id),
    );
  });
  it('cannot repopulate invitations through a late response from a previous account', async () => {
    let finish!: (value: typeof inbox) => void;
    invitations.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const fixture = TestBed.createComponent(CookbookInvitationsComponent);
    TestBed.inject(SessionState).clear('login');
    finish(inbox);
    await fixture.whenStable();
    expect(fixture.componentInstance.invitations()).toEqual([]);
  });
});
