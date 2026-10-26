import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ShoppingState } from './shopping-state';
import { ShoppingModule } from './shopping.module';
import { ShoppingDetailComponent } from './pages/shopping-detail/shopping-detail.component';
import { ShoppingSettingsComponent } from './pages/shopping-settings/shopping-settings.component';
import { ShoppingOverviewComponent } from './pages/shopping-overview/shopping-overview.component';
import { ShoppingService } from '../../core/services/shopping.service';
vi.mock('@microsoft/signalr', () => ({
  HttpTransportType: { LongPolling: 4 },
  LogLevel: { None: 6 },
  HubConnectionState: { Connected: 'Connected', Disconnected: 'Disconnected' },
  HubConnectionBuilder: class {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    configureLogging() {
      return this;
    }
    build() {
      return {
        state: 'Connected',
        on: () => {},
        onreconnected: () => {},
        start: async () => {},
        stop: async () => {},
        invoke: async () => {},
      };
    }
  },
}));
import { ShoppingListResponse } from '../../core/models/shopping.model';
const item = {
  id: 'item',
  text: 'Milk',
  purchased: false,
  version: 'item-v1',
  position: 0,
  editingBy: null,
  reservationExpiresAtUtc: null,
};
const list: ShoppingListResponse = {
  id: 'list',
  name: 'Weekly groceries',
  role: 'Owner',
  version: 'list-v1',
  items: [item],
  members: [
    { userId: 'alice', username: 'alice', displayName: 'Alice', role: 'Owner' },
    { userId: 'bob', username: 'bob', displayName: 'Bob', role: 'Member' },
  ],
  invitations: [],
};
describe('Shopping pages', () => {
  const get = vi.fn(),
    execute = vi.fn(),
    reserve = vi.fn();
  beforeEach(async () => {
    get.mockReset().mockResolvedValue(list);
    execute
      .mockReset()
      .mockResolvedValue({ listId: 'list', version: null, item: null, undoUntilUtc: null });
    reserve
      .mockReset()
      .mockImplementation((_list, _id, token) =>
        Promise.resolve({ token, expiresAtUtc: new Date(Date.now() + 15000).toISOString() }),
      );
    await TestBed.configureTestingModule({
      imports: [ShoppingModule],
      providers: [
        ShoppingState,
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ listId: 'list' }) } },
        },
        {
          provide: ShoppingService,
          useValue: {
            get,
            execute,
            reserve,
            release: async () => {},
            list: async () => [
              {
                id: 'list',
                name: list.name,
                role: 'Owner',
                version: 'list-v1',
                preview: ['Milk', 'Apples', 'Bread', 'Coffee'],
                activeCount: 6,
                purchasedCount: 2,
              },
            ],
            invitations: async () => [
              {
                id: 'invitation',
                listId: 'another-list',
                listName: 'Weekend',
                ownerDisplayName: 'Bob',
                listVersion: 'invited-v1',
              },
            ],
          },
        },
      ],
    }).compileComponents();
  });
  afterEach(() => TestBed.resetTestingModule());
  async function detail() {
    const fixture = TestBed.createComponent(ShoppingDetailComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  async function settings() {
    await TestBed.inject(ShoppingState).open('list');
    const fixture = TestBed.createComponent(ShoppingSettingsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }
  it('renders accessible previews and accepts an invitation using its reviewed version', async () => {
    const fixture = TestBed.createComponent(ShoppingOverviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.componentInstance.state.refresh();
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[data-testid=shopping-card]') as HTMLElement;
    expect(card?.textContent).toContain('Milk');
    expect(card?.textContent).toContain('2 more');
    const accept = fixture.nativeElement.querySelector(
      '[data-testid=accept-invitation]',
    ) as HTMLButtonElement;
    expect(accept).not.toBeNull();
    accept.click();
    await fixture.whenStable();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      kind: 'respond',
      listId: 'another-list',
      invitationId: 'invitation',
      accept: true,
      expectedVersion: 'invited-v1',
    });
  });
  it('focuses an inline editor and saves once when Enter is followed by blur', async () => {
    const fixture = await detail();
    const edit = fixture.nativeElement.querySelector(
      '[data-testid=edit-item]',
    ) as HTMLButtonElement;
    expect(edit).not.toBeNull();
    edit.click();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const input = fixture.nativeElement.querySelector(
      '[data-testid=item-draft]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    input.value = 'Oat milk';
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(execute.mock.calls.filter(([command]) => command.kind === 'edit')).toHaveLength(1);
    expect(execute.mock.calls[0]?.[0].text).toBe('Oat milk');
  });
  it('adds on Enter and returns focus to the quick input after removing an item', async () => {
    const fixture = await detail();
    const input = fixture.nativeElement.querySelector('[data-testid=add-item]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'Apples';
    input.dispatchEvent(new Event('input'));
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ kind: 'add', text: 'Apples' });
    const remove = fixture.nativeElement.querySelector(
      '[data-testid=remove-item]',
    ) as HTMLButtonElement;
    remove.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(document.activeElement).toBe(input);
  });
  it('offers removal Undo in a snackbar without reopening it on each timer tick', async () => {
    const fixture = await detail();
    const action = new Subject<void>();
    const dismiss = vi.fn();
    const open = vi.spyOn(TestBed.inject(MatSnackBar), 'open').mockReturnValue({
      onAction: () => action,
      dismiss,
    } as never);
    execute.mockResolvedValueOnce({
      undoUntilUtc: new Date(Date.now() + 10000).toISOString(),
    });
    get.mockResolvedValueOnce({ ...list, items: [] });
    await fixture.componentInstance.state.remove(item);
    fixture.detectChanges();
    expect(open).toHaveBeenCalledWith('Removed Milk', 'Undo', {
      duration: expect.any(Number),
      panelClass: 'shopping-undo-snackbar',
    });
    expect(open.mock.calls[0][2]!.duration).toBeGreaterThan(0);
    expect(open.mock.calls[0][2]!.duration).toBeLessThanOrEqual(10000);
    expect(fixture.nativeElement.querySelector('.notice.undo')).toBeNull();
    fixture.componentInstance.state.tick();
    fixture.detectChanges();
    expect(open).toHaveBeenCalledTimes(1);
    action.next();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(execute.mock.calls[1][0]).toMatchObject({
      kind: 'restore',
      id: item.id,
      deletionOperationId: execute.mock.calls[0][0].operationId,
    });
    expect(dismiss).toHaveBeenCalled();
  });

  it('dismisses removal feedback on expiry or leaving the page', async () => {
    const fixture = await detail();
    const action = new Subject<void>();
    const dismiss = vi.fn();
    vi.spyOn(TestBed.inject(MatSnackBar), 'open').mockReturnValue({
      onAction: () => action,
      dismiss,
    } as never);
    const undo = {
      id: item.id,
      text: item.text,
      operationId: 'removal',
      until: Date.now() + 10000,
    };
    fixture.componentInstance.state.undo.set([undo]);
    fixture.detectChanges();
    const now = vi.spyOn(Date, 'now').mockReturnValue(undo.until + 1);
    try {
      fixture.componentInstance.state.tick();
    } finally {
      now.mockRestore();
    }
    fixture.detectChanges();
    expect(dismiss).toHaveBeenCalledTimes(1);
    fixture.componentInstance.state.undo.set([undo]);
    fixture.detectChanges();
    fixture.destroy();
    expect(dismiss).toHaveBeenCalledTimes(2);
    action.next();
    expect(execute).not.toHaveBeenCalled();
  });

  it('defaults to List and preserves drafts while switching to Settings and back', async () => {
    const fixture = await detail();
    const tabs = fixture.nativeElement.querySelectorAll('[role=tab]') as NodeListOf<HTMLElement>;
    expect(Array.from(tabs, (tab) => tab.textContent?.trim())).toEqual(['List', 'Settings']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('.list-heading').nextElementSibling.tagName).toBe(
      'MAT-TAB-GROUP',
    );
    fixture.componentInstance.state.addText.set('Apples');
    tabs[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(fixture.nativeElement.querySelector('.quick-add')).toBeNull();
    const settings = fixture.componentInstance.settings!;
    expect(settings.state).toBe(fixture.componentInstance.state);
    settings.name.setValue('Weekend groceries');
    settings.name.markAsDirty();
    tabs[0].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid=add-item]').value).toBe('Apples');
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    tabs[1].click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.settings).toBe(settings);
    expect(settings.name.value).toBe('Weekend groceries');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('renders members in settings and tracks unsaved invitations', async () => {
    const fixture = await settings();
    expect(fixture.nativeElement.querySelector('h2')?.textContent).toBe('Members');
    expect(fixture.nativeElement.querySelector('.quick-add')).toBeNull();
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
    fixture.componentInstance.username.setValue('new-member');
    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
  });

  it('requires explicit deletion confirmation that explains overriding active edits', async () => {
    const fixture = await settings();
    const dialog = vi
      .spyOn(TestBed.inject(MatDialog), 'open')
      .mockReturnValue({ afterClosed: () => of(false), close: () => {} } as never);
    const button = fixture.nativeElement.querySelector(
      '[data-testid=delete-list]',
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await fixture.whenStable();
    expect((dialog.mock.calls[0]?.[1]?.data as { message: string })?.message).toContain(
      'active edits',
    );
    expect(execute).not.toHaveBeenCalled();
  });
  it('hides owner administration from members and offers leaving', async () => {
    get.mockResolvedValue({ ...list, role: 'Member' });
    const fixture = await settings();
    expect(fixture.nativeElement.querySelector('[data-testid=delete-list]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid=invite-member]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid=leave-list]')).not.toBeNull();
  });

  it('keeps a dirty name on its reviewed version until the user explicitly reviews the current name', async () => {
    const fixture = await settings();
    const component = fixture.componentInstance;
    component.name.setValue('My name');
    component.name.markAsDirty();
    get.mockResolvedValue({ ...list, name: 'Other owner name', version: 'list-v2' });
    await component.state.refresh();
    fixture.detectChanges();
    expect(component.name.value).toBe('My name');
    expect(component.nameChangedRemotely()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Current name:');
    await component.rename();
    expect(execute).not.toHaveBeenCalled();
    await component.rename(true);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      kind: 'rename',
      name: 'My name',
      expectedVersion: 'list-v2',
    });
  });
  it('lets the user discard a detached text draft and edit another item', async () => {
    const fixture = await detail();
    const component = fixture.componentInstance;
    await component.state.beginEdit(item);
    component.state.changeText('Keep for copying');
    get.mockResolvedValue({ ...list, items: [{ ...item, id: 'other', text: 'Bread' }] });
    await component.state.refresh();
    fixture.detectChanges();
    const discard = fixture.nativeElement.querySelector(
      '[data-testid=discard-detached-draft]',
    ) as HTMLButtonElement;
    expect(discard).not.toBeNull();
    discard.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.state.draft()).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid=edit-item]').disabled).toBe(false);
  });

  it('uses the authorized current name after retrying a historical rename receipt', async () => {
    const fixture = await settings(),
      component = fixture.componentInstance;
    component.name.setValue('Old acknowledged name');
    component.name.markAsDirty();
    execute.mockRejectedValueOnce(new Error('response lost'));
    await component.rename();
    const operation = execute.mock.calls[0][0];
    get.mockResolvedValue({ ...list, name: 'Newer shared name', version: 'list-v3' });
    execute.mockResolvedValue({
      listId: 'list',
      version: 'list-v2',
      item: null,
      undoUntilUtc: null,
    });
    await component.retry('$admin');
    expect(execute.mock.calls[1][0]).toBe(operation);
    expect(component.name.value).toBe('Newer shared name');
    expect(component.name.pristine).toBe(true);
  });

  it('moves keyboard focus to quick entry while a moved checkbox is still pending', async () => {
    const fixture = await detail();
    let resolve!: (value: unknown) => void;
    execute.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    get.mockResolvedValue({ ...list, items: [{ ...item, purchased: true, version: 'item-v2' }] });
    const checkbox = fixture.nativeElement.querySelector(
      'input[type=checkbox]',
    ) as HTMLInputElement;
    const quick = fixture.nativeElement.querySelector('[data-testid=add-item]') as HTMLInputElement;
    checkbox.focus();
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await new Promise((done) => setTimeout(done, 0));
    expect(document.activeElement).toBe(quick);
    expect(fixture.nativeElement.querySelector('.notice')).toBeNull();
    resolve({ listId: 'list', version: null, item: null, undoUntilUtc: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=checkbox]').checked).toBe(true);
    expect(document.activeElement).toBe(quick);
  });

  it('shows a retry notice when a checkbox save has an unknown result', async () => {
    const fixture = await detail();
    execute.mockRejectedValueOnce(new Error('response lost'));
    await fixture.componentInstance.state.purchase(item);
    fixture.detectChanges();
    const notice = fixture.nativeElement.querySelector('.notice') as HTMLElement;
    expect(notice.textContent).toContain('Result unknown');
    expect(notice.querySelector('button')?.textContent).toContain('Retry');
  });

  it('shows a refresh notice only when the saved checkbox cannot be refreshed', async () => {
    const fixture = await detail();
    let reject!: (reason: Error) => void;
    get.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const saving = fixture.componentInstance.state.purchase(item);
    await Promise.resolve();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notice')).toBeNull();
    reject(new Error('refresh failed'));
    await saving;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notice')?.textContent).toContain(
      'Saved; refresh needed',
    );
  });
});
