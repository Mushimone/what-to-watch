import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WatchlistList } from './watchlist-list';

describe('WatchlistList', () => {
  let component: WatchlistList;
  let fixture: ComponentFixture<WatchlistList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchlistList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WatchlistList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
