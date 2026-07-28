import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Watchlist } from './watchlist';

describe('Watchlist', () => {
  let component: Watchlist;
  let fixture: ComponentFixture<Watchlist>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Watchlist]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Watchlist);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('the tab preselects the chat mode', () => {
    component.isDesktop.set(false);

    component.setSection('add');
    expect(component.activeSection()).toBe('add');
    expect(component.chatMode).toBe('add');

    component.setSection('shared');
    expect(component.activeSection()).toBe('shared');
    expect(component.chatMode).toBe('list');

    component.setSection('list');
    expect(component.activeSection()).toBe('list');
    expect(component.chatMode).toBe('list');
  });

  it('preselects on desktop too — the chat follows the section everywhere', () => {
    component.isDesktop.set(true);
    component.chatMode = 'add';

    component.setSection('list');
    expect(component.activeSection()).toBe('list');
    expect(component.chatMode).toBe('list');

    component.setSection('add');
    expect(component.chatMode).toBe('add');
  });
});
