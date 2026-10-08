import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-photo-picker',
  standalone: false,
  templateUrl: './photo-picker.component.html',
  styleUrl: './photo-picker.component.scss',
})
export class PhotoPickerComponent {
  @Input() preview: string | null = null;
  @Input() busy = false;
  @Input() preparing = false;
  @Input() error = '';
  @Output() readonly photoSelected = new EventEmitter<Event>();
  @Output() readonly photoRemoved = new EventEmitter<void>();
}
