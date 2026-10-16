import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CookbookService } from '../../core/services/cookbook.service';
import { SessionState } from '../../core/services/session-state';
import { MemberResponse } from '../../core/models/account.model';
import { errorMessage } from '../../core/utils/api-error';
@Component({
  selector: 'app-cookbook-settings',
  standalone: false,
  templateUrl: './cookbook-settings.component.html',
  styleUrl: './cookbooks.scss',
})
export class CookbookSettingsComponent {
  readonly books = inject(CookbookService);
  private readonly session = inject(SessionState);
  private readonly destroy = inject(DestroyRef);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('cookbookId')!;
  readonly members = signal<MemberResponse[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  private readonly fb = inject(NonNullableFormBuilder);
  readonly name = this.fb.group({
    name: [
      this.books.context.current()?.name ?? '',
      [Validators.required, Validators.maxLength(100)],
    ],
  });
  readonly member = this.fb.group({
    username: ['', Validators.required],
    role: ['Viewer', Validators.required],
  });
  constructor() {
    this.session.changes.pipe(takeUntilDestroyed()).subscribe(() => {
      this.members.set([]);
      this.name.reset();
      this.member.reset();
    });
    void this.load();
  }
  async load() {
    const epoch = this.session.epoch();
    this.loading.set(true);
    try {
      const members = await this.books.members(this.id);
      if (epoch === this.session.epoch() && !this.destroy.destroyed) this.members.set(members);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
  async rename() {
    if (this.name.invalid) return;
    const epoch = this.session.epoch();
    await this.act(async () => {
      await this.books.rename(this.id, this.name.controls.name.value);
      if (epoch === this.session.epoch() && !this.destroy.destroyed)
        await this.books.select(this.id);
    });
  }
  async add() {
    if (this.member.invalid) return;
    await this.act(async () => {
      const v = this.member.getRawValue();
      await this.books.add(this.id, v.username, v.role);
      this.member.controls.username.reset();
    });
  }
  async role(member: MemberResponse, role: string) {
    await this.act(() => this.books.role(this.id, member.userId, role));
  }
  async remove(member: MemberResponse) {
    await this.act(() => this.books.remove(this.id, member.userId));
  }
  private async act(action: () => Promise<unknown>) {
    if (this.busy()) return;
    const epoch = this.session.epoch();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await action();
      if (epoch === this.session.epoch()) {
        this.notice.set('Cookbook updated.');
        await this.load();
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
