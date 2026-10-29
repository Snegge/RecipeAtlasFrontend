import { Component, HostListener, DestroyRef, effect, inject } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionState } from '../../../../core/services/session-state';
import { ShoppingInvitationResponse } from '../../../../core/models/shopping.model';
import { ShoppingState } from '../../shopping-state';
import { ShoppingEvents } from '../../shopping-events';
@Component({
  selector: 'app-shopping-overview',
  standalone: false,
  templateUrl: './shopping-overview.component.html',
  styleUrl: './shopping-overview.component.scss',
  providers: [ShoppingState, ShoppingEvents],
})
export class ShoppingOverviewComponent {
  readonly state = inject(ShoppingState);
  private readonly events = inject(ShoppingEvents);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(100)],
  });
  constructor() {
    this.events.start(
      () => void this.state.refresh(),
      (id) => this.state.accessLost(id),
    );
    effect(() =>
      this.events.watch(this.state.blocked() ? [] : this.state.lists().map((list) => list.id)),
    );
    this.session.changes.pipe(takeUntilDestroyed()).subscribe((reason) => {
      if (reason !== 'expired') this.name.reset('');
    });
    void this.state.open();
  }
  async create() {
    const name = this.name.value.trim();
    if (!name || this.name.invalid) return;
    const epoch = this.session.epoch();
    if (
      await this.state.submit(
        { kind: 'create', listId: crypto.randomUUID(), name, operationId: crypto.randomUUID() },
        'Create ' + name,
      )
    ) {
      if (epoch === this.session.epoch() && !this.destroy.destroyed) this.name.reset('');
    }
  }
  async retry(key: string) {
    const action = this.state.pending().find((item) => item.key === key);
    const epoch = this.session.epoch();
    const success = await this.state.retry(key);
    if (
      success &&
      epoch === this.session.epoch() &&
      !this.destroy.destroyed &&
      action?.command.kind === 'create'
    )
      this.name.reset('');
  }
  respond(invitation: ShoppingInvitationResponse, accept: boolean) {
    return this.state.submit(
      {
        kind: 'respond',
        listId: invitation.listId,
        invitationId: invitation.id,
        accept,
        expectedVersion: invitation.listVersion,
        operationId: crypto.randomUUID(),
      },
      accept ? 'Accept invitation' : 'Decline invitation',
    );
  }
  hasUnsavedChanges() {
    return !!this.name.value.trim() || this.state.hasUnsavedChanges();
  }
  navigationBlocked() {
    return this.state.navigationBlocked();
  }
  @HostListener('window:beforeunload', ['$event']) beforeUnload(event: BeforeUnloadEvent) {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }
}
