import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** Both legal pages are static prose, so one component serves them off route data. */
@Component({
  selector: 'app-legal',
  imports: [RouterLink],
  templateUrl: './legal.html',
  styleUrl: './legal.scss',
})
export class Legal {
  doc = inject(ActivatedRoute).snapshot.data['doc'] as 'privacy' | 'terms' | 'delete-account';
  updated = 'July 28, 2026';
}
