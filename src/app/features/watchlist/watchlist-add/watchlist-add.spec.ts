import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WatchlistAdd } from './watchlist-add';

describe('WatchlistAdd', () => {
  let component: WatchlistAdd;
  let fixture: ComponentFixture<WatchlistAdd>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchlistAdd],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistAdd);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
