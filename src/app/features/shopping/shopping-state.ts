import { Injectable, DestroyRef, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ShoppingItemResponse,
  ShoppingListResponse,
  ShoppingListSummary,
  ShoppingInvitationResponse,
  ShoppingCommand,
} from '../../core/models/shopping.model';
import { ShoppingService } from '../../core/services/shopping.service';
import { SessionState } from '../../core/services/session-state';
import { errorMessage } from '../../core/utils/api-error';

export interface ShoppingDraft {
  id: string;
  text: string;
  originalText: string;
  version: string;
  token: string;
  expiresAt: number;
  status: 'acquiring' | 'editing' | 'lost' | 'saving' | 'uncertain';
}
export interface PendingShoppingAction {
  key: string;
  label: string;
  command: ShoppingCommand;
  status: 'sending' | 'uncertain' | 'confirmed';
}
@Injectable()
export class ShoppingState {
  private readonly api = inject(ShoppingService);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  readonly list = signal<ShoppingListResponse | null>(null);
  readonly lists = signal<ShoppingListSummary[]>([]);
  readonly invitations = signal<ShoppingInvitationResponse[]>([]);
  readonly draft = signal<ShoppingDraft | null>(null);
  readonly pending = signal<PendingShoppingAction[]>([]);
  readonly addText = signal('');
  readonly blocked = signal(false);
  readonly departed = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly now = signal(Date.now());
  readonly undo = signal<{ id: string; text: string; operationId: string; until: number }[]>([]);
  readonly items = computed(() => {
    const actions = this.pending();
    return (this.list()?.items ?? []).flatMap((item) => {
      const action = actions.find((p) => p.key === item.id);
      if (action?.command.kind === 'remove') return [];
      return [
        {
          ...item,
          purchased:
            action?.command.kind === 'purchase' ? action.command.purchased : item.purchased,
        },
      ];
    });
  });
  readonly remaining = computed(() => this.items().filter((item) => !item.purchased));
  readonly purchased = computed(() => this.items().filter((item) => item.purchased));
  private listId = '';
  private opened = false;
  private revision = 0;
  private readSequence = 0;

  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe((reason) => {
      this.interrupt();
      this.blocked.set(true);
      this.revision++;
      this.list.set(null);
      this.lists.set([]);
      this.invitations.set([]);
      this.undo.set([]);
      this.error.set('Your session has ended. Copy any unsaved text before signing in again.');
      if (reason !== 'expired') {
        this.draft.set(null);
        this.addText.set('');
        this.pending.set([]);
      } else this.loseReservation();
    });
    const tick = setInterval(() => this.tick(), 1000);
    const refresh = () => {
      this.tick();
      if (document.visibilityState === 'visible' && this.opened) void this.refresh();
    };
    const fallback = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    this.destroy.onDestroy(() => {
      clearInterval(tick);
      clearInterval(fallback);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      const draft = this.draft();
      if (draft && !this.blocked())
        void this.api.release(this.listId, draft.id, draft.token).catch(() => {});
    });
  }
  async open(id = '') {
    this.listId = id;
    this.opened = true;
    return this.refresh();
  }
  private current(epoch: number) {
    return (
      !this.destroy.destroyed &&
      epoch === this.session.epoch() &&
      !this.blocked() &&
      !this.departed()
    );
  }
  async refresh(): Promise<boolean> {
    if (this.blocked() || this.departed() || !this.opened) return false;
    const epoch = this.session.epoch(),
      revision = this.revision,
      sequence = ++this.readSequence;
    try {
      const value = this.listId
        ? await this.api.get(this.listId)
        : await Promise.all([this.api.list(), this.api.invitations()]);
      if (!this.current(epoch) || sequence !== this.readSequence || revision !== this.revision)
        return false;
      if (Array.isArray(value)) {
        this.lists.set(value[0]);
        this.invitations.set(value[1]);
      } else this.list.set(value);
      // Receipts are historical acknowledgements; only this authorized GET supplies current content.
      this.pending.update((items) => items.filter((item) => item.status !== 'confirmed'));
      return true;
    } catch (e) {
      if (!this.current(epoch) || sequence !== this.readSequence || revision !== this.revision)
        return false;
      if (e instanceof HttpErrorResponse && [401, 403, 404].includes(e.status))
        this.accessLost(this.listId);
      else this.error.set(errorMessage(e));
      return false;
    } finally {
      if (this.current(epoch) && sequence === this.readSequence) this.loading.set(false);
    }
  }
  private interrupt() {
    this.loading.set(false);
    this.pending.update((items) =>
      items.map((item) => (item.status === 'sending' ? { ...item, status: 'uncertain' } : item)),
    );
    this.draft.update((draft) =>
      draft?.status === 'saving' ? { ...draft, status: 'uncertain' } : draft,
    );
  }
  accessLost(id: string) {
    if (!id || id === this.listId) {
      this.revision++;
      this.blocked.set(true);
      this.interrupt();
      this.list.set(null);
      this.lists.set([]);
      this.invitations.set([]);
      this.undo.set([]);
      this.loseReservation();
      this.error.set(
        'This list is unavailable or your access has ended. Your unsaved text is kept below for copying.',
      );
    } else if (!this.listId) {
      this.revision++;
      this.lists.update((lists) => lists.filter((list) => list.id !== id));
      this.invitations.update((invites) => invites.filter((invite) => invite.listId !== id));
      void this.refresh();
    }
  }
  tick() {
    this.now.set(Date.now());
    this.undo.update((items) => items.filter((item) => item.until > this.now()));
    const draft = this.draft();
    if (draft?.status === 'editing' && draft.expiresAt <= this.now()) this.loseReservation();
  }
  private loseReservation() {
    this.draft.update((draft) =>
      draft && draft.status !== 'uncertain' && draft.status !== 'saving'
        ? { ...draft, status: 'lost' }
        : draft,
    );
  }
  isPending(key: string) {
    return this.pending().some((item) => item.key === key);
  }
  reserved(item: ShoppingItemResponse) {
    return !!item.editingBy && Date.parse(item.reservationExpiresAtUtc ?? '') > this.now();
  }
  async beginEdit(item: ShoppingItemResponse) {
    if (this.blocked() || this.draft() || this.isPending(item.id) || this.reserved(item)) return;
    await this.acquire(item, item.text);
  }
  private async acquire(item: ShoppingItemResponse, text: string) {
    const epoch = this.session.epoch();
    const token = crypto.randomUUID();
    this.draft.set({
      id: item.id,
      text,
      originalText: item.text,
      version: item.version,
      token,
      expiresAt: 0,
      status: 'acquiring',
    });
    try {
      const lease = await this.api.reserve(this.listId, item.id, token, item.version);
      if (!this.current(epoch)) return;
      if (this.draft()?.token !== token) {
        void this.api.release(this.listId, item.id, token).catch(() => {});
        return;
      }
      this.draft.update(
        (draft) =>
          draft && {
            ...draft,
            expiresAt: Date.parse(lease.expiresAtUtc),
            status: Date.parse(lease.expiresAtUtc) > Date.now() ? 'editing' : 'lost',
          },
      );
    } catch (e) {
      if (!this.current(epoch) || this.draft()?.token !== token) return;
      this.loseReservation();
      this.error.set(errorMessage(e));
      await this.refresh();
    }
  }
  changeText(text: string) {
    this.draft.update((draft) =>
      draft && ['editing', 'lost'].includes(draft.status) ? { ...draft, text } : draft,
    );
  }
  async reacquire() {
    const draft = this.draft();
    const item = this.list()?.items.find((item) => item.id === draft?.id);
    if (!draft || draft.status !== 'lost' || !item || this.blocked() || this.isPending(item.id))
      return;
    await this.acquire(item, draft.text);
  }
  async cancelEdit() {
    const draft = this.draft();
    if (!draft || this.isPending(draft.id)) return;
    this.draft.set(null);
    if (!this.blocked()) {
      await this.api.release(this.listId, draft.id, draft.token).catch(() => {});
      await this.refresh();
    }
  }
  async save() {
    this.tick();
    const draft = this.draft();
    if (!draft || draft.status !== 'editing' || this.blocked() || this.isPending(draft.id)) return;
    const text = draft.text.trim();
    if (!text || text.length > 500) {
      this.error.set('Use between 1 and 500 characters.');
      return;
    }
    if (text === draft.originalText) {
      await this.cancelEdit();
      return;
    }
    this.draft.set({ ...draft, status: 'saving' });
    await this.submit(
      {
        kind: 'edit',
        listId: this.listId,
        id: draft.id,
        text,
        expectedVersion: draft.version,
        token: draft.token,
        operationId: crypto.randomUUID(),
      },
      'Save item',
    );
  }
  async add() {
    const text = this.addText().trim();
    if (!text || text.length > 500) return false;
    return this.submit(
      {
        kind: 'add',
        listId: this.listId,
        id: crypto.randomUUID(),
        text,
        operationId: crypto.randomUUID(),
      },
      'Add ' + text,
    );
  }
  async purchase(item: ShoppingItemResponse) {
    if (this.reserved(item) || this.draft()?.id === item.id) return;
    await this.submit(
      {
        kind: 'purchase',
        listId: this.listId,
        id: item.id,
        purchased: !item.purchased,
        expectedVersion: item.version,
        operationId: crypto.randomUUID(),
      },
      item.purchased ? 'Mark as needed' : 'Mark as purchased',
    );
  }
  async remove(item: ShoppingItemResponse) {
    if (this.reserved(item) || this.draft()?.id === item.id) return;
    await this.submit(
      {
        kind: 'remove',
        listId: this.listId,
        id: item.id,
        expectedVersion: item.version,
        operationId: crypto.randomUUID(),
      },
      item.text,
    );
  }
  canRestore(id: string) {
    const action = this.pending().find((item) => item.key === id);
    return (
      !this.blocked() &&
      (!action || (action.status === 'confirmed' && action.command.kind === 'remove'))
    );
  }
  async restore(id: string) {
    this.tick();
    const undo = this.undo().find((item) => item.id === id);
    if (!undo || !this.canRestore(id)) return;
    this.pending.update((items) => items.filter((item) => item.key !== id));
    await this.submit(
      {
        kind: 'restore',
        listId: this.listId,
        id,
        deletionOperationId: undo.operationId,
        operationId: crypto.randomUUID(),
      },
      'Undo removal',
    );
  }
  private key(command: ShoppingCommand) {
    return command.kind === 'add' ? '$add' : 'id' in command ? command.id : '$admin';
  }
  async submit(command: ShoppingCommand, label: string): Promise<boolean> {
    const key = this.key(command);
    if (this.blocked() || this.departed() || this.isPending(key)) return false;
    const pending: PendingShoppingAction = {
      key,
      label,
      command: Object.freeze({ ...command }),
      status: 'sending',
    };
    this.pending.update((items) => [...items, pending]);
    return this.send(pending);
  }
  async retry(key: string) {
    const pending = this.pending().find((item) => item.key === key);
    if (!pending || pending.status === 'sending' || this.blocked()) return false;
    if (pending.status === 'confirmed') return this.refresh();
    return this.send(pending);
  }
  private async send(action: PendingShoppingAction): Promise<boolean> {
    const epoch = this.session.epoch(),
      command = action.command;
    this.revision++;
    this.error.set('');
    this.pending.update((items) =>
      items.map((item) => (item.key === action.key ? { ...item, status: 'sending' } : item)),
    );
    try {
      const result = await this.api.execute(command);
      // Own departure can be announced before its successful HTTP acknowledgement.
      if (
        !this.destroy.destroyed &&
        epoch === this.session.epoch() &&
        (command.kind === 'delete' || command.kind === 'leave')
      ) {
        this.revision++;
        this.departed.set(true);
        this.loading.set(false);
        this.list.set(null);
        this.pending.set([]);
        this.draft.set(null);
        this.addText.set('');
        return true;
      }
      if (!this.current(epoch)) return false;
      this.revision++;
      this.pending.update((items) =>
        items.map((item) => (item.key === action.key ? { ...item, status: 'confirmed' } : item)),
      );
      if (command.kind === 'edit') this.draft.set(null);
      if (command.kind === 'add' && this.addText().trim() === command.text) this.addText.set('');
      if (
        command.kind === 'remove' &&
        result?.undoUntilUtc &&
        Date.parse(result.undoUntilUtc) > Date.now()
      ) {
        this.undo.update((items) => [
          ...items.filter((item) => item.id !== command.id),
          {
            id: command.id,
            text: action.label,
            operationId: command.operationId,
            until: Date.parse(result.undoUntilUtc!),
          },
        ]);
      }
      if (command.kind === 'restore')
        this.undo.update((items) => items.filter((item) => item.id !== command.id));
      await this.refresh();
      return true;
    } catch (e) {
      if (!this.current(epoch)) return false;
      this.revision++;
      const uncertain = !(e instanceof HttpErrorResponse) || e.status === 0 || e.status >= 500;
      this.pending.update((items) =>
        uncertain
          ? items.map((item) => (item.key === action.key ? { ...item, status: 'uncertain' } : item))
          : items.filter((item) => item.key !== action.key),
      );
      if (command.kind === 'edit')
        this.draft.update(
          (draft) => draft && { ...draft, status: uncertain ? 'uncertain' : 'lost' },
        );
      this.error.set(
        uncertain
          ? 'The result is unknown. Retry the same action below to check safely. Keep this page open.'
          : errorMessage(e),
      );
      if (!uncertain) await this.refresh();
      return false;
    }
  }
  hasUnsavedChanges() {
    return !!this.draft() || !!this.addText().trim() || this.pending().length > 0;
  }
  navigationBlocked() {
    return this.pending().some((item) => item.status === 'sending');
  }
}
