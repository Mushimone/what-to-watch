import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  constructor(private supabase: SupabaseService) {}

  loginWithGoogle() {
    this.supabase.signInWithGoogle();
  }
}
