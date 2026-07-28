import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';

import { WatchlistProfile } from './watchlist-profile';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ProfileService } from '../../../core/services/profile.service';
import { FriendsService } from '../../../core/services/friends.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { Profile } from '../../../core/models/profile.model';

const item = (watched: boolean) => ({ id: crypto.randomUUID(), watched }) as WatchlistItem;

describe('WatchlistProfile', () => {
  const build = async (items: WatchlistItem[], friends: Profile[], profile: Profile | null) => {
    await TestBed.configureTestingModule({
      imports: [WatchlistProfile],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: { getCurrentUser: () => ({ email: 'me@example.com' }) },
        },
        { provide: ProfileService, useValue: { profile$: of(profile), loadProfile: vi.fn() } },
        { provide: FriendsService, useValue: { friends$: of(friends), getFriends: vi.fn() } },
        {
          provide: WatchlistService,
          useValue: {
            watchlistItems$: new BehaviorSubject(items),
            getWatchlist: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    return TestBed.createComponent(WatchlistProfile).componentInstance;
  };

  it('counts what is tracked, what is watched, and who you watch with', async () => {
    const profile = { username: 'Simone' } as Profile;
    const component = await build(
      [item(true), item(false), item(true)],
      [{} as Profile, {} as Profile],
      profile,
    );

    expect(component.tracked()).toBe(3);
    expect(component.watched()).toBe(2);
    expect(component.friendCount()).toBe(2);
    expect(component.initial()).toBe('S');
  });

  it('falls back to the sign-in email when there is no username yet', async () => {
    const component = await build([], [], null);

    expect(component.tracked()).toBe(0);
    expect(component.initial()).toBe('M');
  });
});
