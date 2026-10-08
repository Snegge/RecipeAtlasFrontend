import { Component, input } from '@angular/core';

// Local SVG icons keep the UI independent of external font/CDN requests.
const paths: Record<string, string> = {
  book: 'M4 4h12a4 4 0 0 1 4 4v13H8a4 4 0 0 1-4-4V4Zm4 0v17M12 9h4m-4 4h4',
  plus: 'M12 5v14M5 12h14',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  back: 'm12 5-7 7 7 7M5 12h15',
  close: 'm6 6 12 12M6 18 18 6',
  edit: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  people:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8m6 10v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  image: 'M3 3h18v18H3V3Zm0 14 6-6 4 4 3-3 5 5M8 7h.01',
  logout: 'M9 21H3V3h6m7 4 5 5-5 5M8 12h13',
  check: 'm5 12 4 4L19 6',
  link: 'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  lock: 'M5 10h14v11H5V10Zm3 0V6a4 4 0 0 1 8 0v4m-4 5v2',
  minus: 'M5 12h14',
};
@Component({
  selector: 'app-icon',
  standalone: false,
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
})
export class IconComponent {
  readonly name = input.required<string>();
  path() {
    return paths[this.name()] ?? paths['book'];
  }
}
