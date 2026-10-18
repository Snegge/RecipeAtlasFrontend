import { Component, computed, input, signal } from '@angular/core';
@Component({
  selector: 'app-avatar',
  standalone: false,
  template: `@if (imageUrl() && failed() !== imageUrl()) {
      <img [src]="imageUrl()!" alt="" (error)="failed.set(imageUrl())" />
    } @else {
      <span aria-hidden="true">{{ initials() }}</span>
    }`,
  styles: [
    `
      :host {
        display: inline-grid;
        place-items: center;
        flex-shrink: 0;
        width: var(--avatar-size, 40px);
        height: var(--avatar-size, 40px);
        overflow: hidden;
        border-radius: 50%;
        background: #e4eee5;
        color: #175c46;
        font-size: calc(var(--avatar-size, 40px) * 0.32);
        font-weight: 700;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      span {
        line-height: 1;
      }
    `,
  ],
})
export class AvatarComponent {
  readonly name = input('');
  readonly imageUrl = input<string | null | undefined>(null);
  readonly failed = signal<string | null | undefined>(null);
  readonly initials = computed(
    () =>
      this.name()
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((x) => x[0])
        .join('')
        .toUpperCase() || '?',
  );
}
