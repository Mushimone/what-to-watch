import { Component } from '@angular/core';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { WatchlistList } from './watchlist-list/watchlist-list';
import { WatchlistAdd } from './watchlist-add/watchlist-add';
import { WatchlistAiChatComponent, ChatMode } from './watchlist-ai-chat/watchlist-ai.chat';

@Component({
  selector: 'app-watchlist',
  imports: [MatTabsModule, WatchlistList, WatchlistAdd, WatchlistAiChatComponent],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist {
  chatMode: ChatMode = 'list';

  onTabChange(event: MatTabChangeEvent): void {
    // tab 0 = Watchlist (list mode), tab 1 = Add (add mode)
    this.chatMode = event.index === 1 ? 'add' : 'list';
  }
}
