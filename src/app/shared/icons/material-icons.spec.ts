import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SharedModule } from '../shared.module';

@Component({
  standalone: true,
  imports: [SharedModule],
  template: '<button mat-icon-button aria-label="Menu"><mat-icon svgIcon="menu" /></button>',
})
class IconButtonExample {}

describe('Local Material icons', () => {
  it('renders the Material SVG in an accessible icon button without an HttpClient or external font', async () => {
    await TestBed.configureTestingModule({ imports: [IconButtonExample] }).compileComponents();
    const fixture = TestBed.createComponent(IconButtonExample);
    fixture.detectChanges();
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button');
    const icon = button.querySelector('mat-icon');
    expect(button.getAttribute('aria-label')).toBe('Menu');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(fixture.nativeElement.querySelector('app-icon')).toBeNull();
  });
});
