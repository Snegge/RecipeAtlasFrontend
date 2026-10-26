import { Component, DestroyRef, effect, inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionState } from '../../../../core/services/session-state';
import { ShoppingCommand, ShoppingMemberResponse } from '../../../../core/models/shopping.model';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ShoppingState } from '../../shopping-state';
@Component({
  selector: 'app-shopping-settings',
  standalone: false,
  templateUrl: './shopping-settings.component.html',
  styleUrl: './shopping-settings.component.scss',
})
export class ShoppingSettingsComponent {
  readonly state = inject(ShoppingState);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  readonly username = new FormControl('', { nonNullable: true, validators: [Validators.required] });
  private nameVersion = '';
  constructor() {
    effect(() => {
      const list = this.state.list();
      if (list && !this.name.dirty) {
        this.name.setValue(list.name);
        this.nameVersion = list.version;
      }
    });
    effect(() => {
      if (this.state.departed()) void this.router.navigateByUrl('/shopping-lists');
    });
    this.session.changes.pipe(takeUntilDestroyed()).subscribe((reason) => {
      if (reason !== 'expired') {
        this.name.reset('');
        this.username.reset('');
      }
    });
  }
  nameChangedRemotely() {
    return this.name.dirty && this.nameVersion !== this.state.list()?.version;
  }
  async rename(reviewed = false) {
    const list = this.state.list(),
      name = this.name.value.trim();
    if (!list || !name || this.name.invalid || (this.nameChangedRemotely() && !reviewed)) return;
    const command: ShoppingCommand = {
      kind: 'rename',
      listId: list.id,
      name,
      expectedVersion: reviewed ? list.version : this.nameVersion,
      operationId: crypto.randomUUID(),
    };
    await this.run(command, 'Rename list');
  }
  async invite() {
    const list = this.state.list(),
      username = this.username.value.trim();
    if (!list || !username) return;
    await this.run(
      {
        kind: 'invite',
        listId: list.id,
        username,
        expectedVersion: list.version,
        operationId: crypto.randomUUID(),
      },
      'Invite ' + username,
    );
  }
  async cancelInvitation(id: string) {
    const list = this.state.list();
    if (!list) return;
    await this.run(
      {
        kind: 'cancel-invitation',
        listId: list.id,
        invitationId: id,
        expectedVersion: list.version,
        operationId: crypto.randomUUID(),
      },
      'Cancel invitation',
    );
  }
  async member(member: ShoppingMemberResponse, transfer: boolean) {
    const list = this.state.list();
    if (!list) return;
    const command: ShoppingCommand = transfer
      ? {
          kind: 'transfer',
          listId: list.id,
          newOwnerUserId: member.userId,
          expectedVersion: list.version,
          operationId: crypto.randomUUID(),
        }
      : {
          kind: 'remove-member',
          listId: list.id,
          userId: member.userId,
          expectedVersion: list.version,
          operationId: crypto.randomUUID(),
        };
    await this.confirm(
      command,
      transfer ? 'Transfer ownership?' : 'Remove member?',
      transfer
        ? member.displayName +
            ' will own this list. You will remain a member and can leave separately.'
        : member.displayName + ' will lose access to this list.',
      transfer ? 'Transfer ownership' : 'Remove member',
    );
  }
  async leaveOrDelete(remove: boolean) {
    const list = this.state.list();
    if (!list) return;
    await this.confirm(
      {
        kind: remove ? 'delete' : 'leave',
        listId: list.id,
        expectedVersion: list.version,
        operationId: crypto.randomUUID(),
      },
      (remove ? 'Delete “' : 'Leave “') + list.name + '”?',
      remove
        ? 'This permanently deletes the list and its items for everyone, including any active edits. Deletion overrides editing reservations and cannot be undone.'
        : 'You will lose access to this list. Its owner can invite you again.',
      remove ? 'Delete list' : 'Leave list',
    );
  }
  private async confirm(command: ShoppingCommand, title: string, message: string, action: string) {
    if (this.state.isPending('$admin') || this.state.blocked()) return;
    const epoch = this.session.epoch();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title, message, action },
      maxWidth: '440px',
      width: 'calc(100% - 32px)',
    });
    const close = this.session.changes.subscribe(() => ref.close());
    const stop = this.destroy.onDestroy(() => ref.close());
    let confirmed;
    try {
      confirmed = await firstValueFrom(ref.afterClosed());
    } finally {
      close.unsubscribe();
      stop();
    }
    if (confirmed && epoch === this.session.epoch() && !this.destroy.destroyed)
      await this.run(command, action);
  }
  private async run(command: ShoppingCommand, label: string) {
    const epoch = this.session.epoch();
    if (await this.state.submit(command, label)) this.finished(command, epoch);
  }
  async retry(key: string) {
    const action = this.state.pending().find((item) => item.key === key),
      epoch = this.session.epoch();
    if (await this.state.retry(key)) {
      if (action) this.finished(action.command, epoch);
    }
  }
  private finished(command: ShoppingCommand, epoch: number) {
    if (epoch !== this.session.epoch() || this.destroy.destroyed) return;
    if (command.kind === 'rename') {
      const list = this.state.list();
      if (list && !this.state.isPending('$admin')) {
        this.name.reset(list.name);
        this.nameVersion = list.version;
      }
    }
    if (command.kind === 'invite') this.username.reset('');
  }
  hasUnsavedChanges() {
    return (
      !this.state.departed() &&
      (this.state.hasUnsavedChanges() || this.name.dirty || !!this.username.value.trim())
    );
  }
}
