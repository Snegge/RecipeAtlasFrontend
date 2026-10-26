import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ShoppingState } from './shopping-state';
import { ShoppingService } from '../../core/services/shopping.service';
import { SessionState } from '../../core/services/session-state';
import { ShoppingItemResponse, ShoppingListResponse } from '../../core/models/shopping.model';
const item: ShoppingItemResponse = {
  id: 'item',
  text: 'Milk',
  purchased: false,
  version: 'item-v1',
  position: 0,
  editingBy: null,
  reservationExpiresAtUtc: null,
};
function snapshot(items = [{ ...item }]): ShoppingListResponse {
  return {
    id: 'list',
    name: 'Weekly shop',
    role: 'Owner',
    version: 'list-v1',
    items,
    members: [],
    invitations: [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('Shopping state', () => {
  let state: ShoppingState;
  const get = vi.fn(),
    execute = vi.fn(),
    reserve = vi.fn(),
    release = vi.fn();
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'));
    get.mockReset().mockResolvedValue(snapshot());
    execute
      .mockReset()
      .mockResolvedValue({ listId: 'list', version: null, item: null, undoUntilUtc: null });
    reserve
      .mockReset()
      .mockImplementation((_list, _id, token) =>
        Promise.resolve({ token, expiresAtUtc: new Date(Date.now() + 15000).toISOString() }),
      );
    release.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        ShoppingState,
        {
          provide: ShoppingService,
          useValue: {
            get,
            execute,
            reserve,
            release,
            list: async () => [],
            invitations: async () => [],
          },
        },
      ],
    });
    state = TestBed.inject(ShoppingState);
    await state.open('list');
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('loads the authorized current snapshot', () => {
    expect(state.list()?.name).toBe('Weekly shop');
    expect(state.items()[0]?.text).toBe('Milk');
  });
  it('retains drafts through refresh and saves the reserved version on Enter or blur', async () => {
    await state.beginEdit(item);
    state.changeText('Oat milk');
    await state.refresh();
    expect(state.draft()?.text).toBe('Oat milk');
    get.mockResolvedValue(snapshot([{ ...item, text: 'Oat milk', version: 'item-v2' }]));
    await state.save();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      kind: 'edit',
      text: 'Oat milk',
      expectedVersion: 'item-v1',
      token: reserve.mock.calls[0]?.[2],
    });
    expect(state.draft()).toBeNull();
    expect(state.items()[0]?.text).toBe('Oat milk');
  });
  it('retries exactly the uncertain operation and never renders its historical item receipt', async () => {
    execute.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await state.beginEdit(item);
    state.changeText('Oat milk');
    await state.save();
    expect(state.pending()[0]?.status).toBe('uncertain');
    const command = execute.mock.calls[0]?.[0];
    get.mockResolvedValue(snapshot([{ ...item, text: 'Newer shared edit', version: 'item-v3' }]));
    execute.mockResolvedValue({
      listId: 'list',
      version: null,
      item: { ...item, text: 'Oat milk', version: 'item-v2' },
      undoUntilUtc: null,
    });
    await state.retry('item');
    expect(execute.mock.calls[1]?.[0]).toBe(command);
    expect(state.items()[0]?.text).toBe('Newer shared edit');
    expect(state.pending()).toEqual([]);
  });
  it('rejects a GET begun before a mutation after a newer snapshot has loaded', async () => {
    const old = deferred<ShoppingListResponse>();
    get.mockReturnValueOnce(old.promise);
    const refresh = state.refresh();
    get.mockResolvedValue(snapshot([{ ...item, purchased: true, version: 'item-v2' }]));
    await state.purchase(item);
    old.resolve(snapshot());
    await refresh;
    expect(state.items()[0]?.purchased).toBe(true);
  });
  it('shows optimistic purchases and rolls them back on a known conflict', async () => {
    const result = deferred<never>();
    execute.mockReturnValueOnce(result.promise);
    const action = state.purchase(item);
    expect(state.items()[0]?.purchased).toBe(true);
    result.resolve(Promise.reject(new HttpErrorResponse({ status: 409 })) as never);
    await action;
    expect(state.items()[0]?.purchased).toBe(false);
    expect(state.pending()).toEqual([]);
  });
  it('expires protection without discarding text and reacquires only the reviewed current version with a new token', async () => {
    await state.beginEdit(item);
    state.changeText('My text');
    const oldToken = state.draft()?.token;
    vi.setSystemTime(new Date('2026-10-21T12:00:16Z'));
    state.tick();
    expect(state.draft()?.status).toBe('lost');
    expect(state.draft()?.text).toBe('My text');
    await state.save();
    expect(execute).not.toHaveBeenCalled();
    get.mockResolvedValue(snapshot([{ ...item, text: 'Their text', version: 'item-v2' }]));
    await state.refresh();
    await state.reacquire();
    expect(state.draft()?.text).toBe('My text');
    expect(reserve.mock.calls[1]?.[3]).toBe('item-v2');
    expect(state.draft()?.token).not.toBe(oldToken);
  });
  it('does not extend an uncertain removal Undo deadline during a receipt retry', async () => {
    execute.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await state.remove(item);
    expect(state.items()).toEqual([]);
    vi.setSystemTime(new Date('2026-10-21T12:00:06Z'));
    execute.mockResolvedValue({
      listId: 'list',
      version: null,
      item: null,
      undoUntilUtc: '2026-10-21T12:00:05Z',
    });
    get.mockResolvedValue(snapshot([]));
    await state.retry('item');
    expect(state.undo()).toEqual([]);
    await state.restore('item');
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('keeps copyable drafts on access loss and clears private work on explicit account change', async () => {
    await state.beginEdit(item);
    state.changeText('Unsaved private text');
    state.addText.set('Another draft');
    state.accessLost('list');
    expect(state.list()).toBeNull();
    expect(state.blocked()).toBe(true);
    expect(state.draft()?.text).toBe('Unsaved private text');
    TestBed.inject(SessionState).clear('login');
    expect(state.draft()).toBeNull();
    expect(state.addText()).toBe('');
  });
  it('ignores a completed promise after account switch', async () => {
    const old = deferred<ShoppingListResponse>();
    get.mockReturnValueOnce(old.promise);
    const refresh = state.refresh();
    old.resolve(snapshot());
    TestBed.inject(SessionState).clear('login');
    await refresh;
    expect(state.list()).toBeNull();
  });

  it('releases loading and in-flight navigation locks on lost access while keeping the exact request', async () => {
    const result = deferred<never>();
    execute.mockReturnValueOnce(result.promise);
    const action = state.purchase(item);
    const command = state.pending()[0].command;
    state.loading.set(true);
    state.accessLost('list');
    result.resolve(null as never);
    await action;
    expect(state.loading()).toBe(false);
    expect(state.navigationBlocked()).toBe(false);
    expect(state.pending()[0].status).toBe('uncertain');
    expect(state.pending()[0].command).toBe(command);
    expect(state.hasUnsavedChanges()).toBe(true);
  });
  it('preserves an interrupted save on session expiry without trapping logout', async () => {
    TestBed.inject(SessionState).user.set({
      id: 'alice',
      username: 'alice',
      displayName: 'Alice',
      email: null,
      avatarUrl: null,
      isAdministrator: false,
    });
    await state.beginEdit(item);
    state.changeText('Preserved text');
    const result = deferred<never>();
    execute.mockReturnValueOnce(result.promise);
    const saving = state.save();
    TestBed.inject(SessionState).clear('expired');
    result.resolve(null as never);
    await saving;
    expect(state.draft()?.text).toBe('Preserved text');
    expect(state.draft()?.status).toBe('uncertain');
    expect(state.navigationBlocked()).toBe(false);
    expect(state.hasUnsavedChanges()).toBe(true);
  });
  it('recognizes own confirmed deletion when AccessLost arrives before its HTTP response', async () => {
    const result = deferred<never>();
    execute.mockReturnValueOnce(result.promise);
    const deleting = state.submit(
      { kind: 'delete', listId: 'list', expectedVersion: 'list-v1', operationId: 'delete-list' },
      'Delete list',
    );
    state.accessLost('list');
    result.resolve(null as never);
    expect(await deleting).toBe(true);
    expect(state.departed()).toBe(true);
    expect(state.hasUnsavedChanges()).toBe(false);
  });
  it('lets the fixed fifteen-second protection expire without any renewal traffic', async () => {
    await state.beginEdit(item);
    state.changeText('Still editing');
    await vi.advanceTimersByTimeAsync(15001);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(state.draft()?.status).toBe('lost');
    expect(state.draft()?.text).toBe('Still editing');
  });

  it('allows Undo immediately after deletion acknowledgement even while its GET is pending', async () => {
    const read = deferred<ShoppingListResponse>();
    execute.mockResolvedValueOnce({
      listId: 'list',
      version: null,
      item: null,
      undoUntilUtc: '2026-10-21T12:00:05Z',
    });
    get.mockReturnValueOnce(read.promise);
    const removing = state.remove(item);
    await Promise.resolve();
    await Promise.resolve();
    const deletion = execute.mock.calls[0][0].operationId;
    expect(state.undo()).toHaveLength(1);
    get.mockResolvedValue(snapshot());
    await state.restore('item');
    expect(execute.mock.calls[1]?.[0]).toMatchObject({
      kind: 'restore',
      deletionOperationId: deletion,
    });
    read.resolve(snapshot([]));
    await removing;
    expect(state.items()[0]?.text).toBe('Milk');
  });

  it('blocks a denied overview without repeatedly requesting private lists', async () => {
    const list = vi
      .spyOn(TestBed.inject(ShoppingService), 'list')
      .mockRejectedValue(new HttpErrorResponse({ status: 403 }));
    await state.open();
    expect(state.blocked()).toBe(true);
    expect(state.loading()).toBe(false);
    expect(state.lists()).toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
  });
});
