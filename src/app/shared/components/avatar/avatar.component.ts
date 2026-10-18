import { Component, computed, input, signal } from '@angular/core';
@Component({
  selector: 'app-avatar',
  standalone: false,
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
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
