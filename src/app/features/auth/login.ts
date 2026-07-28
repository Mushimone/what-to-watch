import { Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private router = inject(Router);
  private emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');

  email = signal('');
  password = signal('');
  error = signal('');
  /** Drives the submit button's label, spinner and disabled state. */
  state = signal<'idle' | 'busy' | 'ok'>('idle');
  showForm = signal(false);

  constructor(private supabase: SupabaseService) {
    // Revealing the form should put the caret in it — one click, not two.
    effect(() => this.emailInput()?.nativeElement.focus());
  }

  loginWithGoogle() {
    this.supabase.signInWithGoogle();
  }

  /** Editing a rejected field clears the rejection; stale errors lie. */
  edit(field: 'email' | 'password', value: string) {
    this[field].set(value);
    this.error.set('');
  }

  async loginWithPassword() {
    this.state.set('busy');
    this.error.set('');
    const { error } = await this.supabase.signInWithPassword(this.email(), this.password());
    if (error) {
      this.state.set('idle');
      this.error.set(error.message);
      return;
    }
    this.state.set('ok');
    // OAuth returns through a page load and hits the guard; this form never
    // leaves the page, so it has to navigate itself.
    this.router.navigate(['/watchlist']);
  }
}
