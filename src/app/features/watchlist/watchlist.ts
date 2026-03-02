import { Component } from '@angular/core';
import { WatchlistService } from '../../core/services/watchlist.service';
import { WatchlistItem } from '../../core/models/watchlist-item.model';
import { MatTabsModule } from '@angular/material/tabs';
import { MatButtonModule } from '@angular/material/button';
import { AsyncPipe } from '@angular/common';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-watchlist',
  imports: [MatTabsModule, MatButtonModule, AsyncPipe],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist {
  watchlistItems$: Observable<WatchlistItem[]>;

  constructor(private watchlist: WatchlistService) {
    this.watchlistItems$ = this.watchlist.watchlistItems$;
  }

  ngOnInit() {
    // this.watchlist.getWatchlist();
  }

  removeFromWatchlist(id: string) {
    this.watchlist.removeFromWatchlist(id);
  }
}
