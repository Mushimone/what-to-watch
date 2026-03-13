import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { WatchlistList } from './watchlist-list/watchlist-list';
import { WatchlistAdd } from './watchlist-add/watchlist-add';

@Component({
  selector: 'app-watchlist',
  imports: [MatTabsModule, WatchlistList, WatchlistAdd],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist {}
