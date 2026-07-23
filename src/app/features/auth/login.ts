import { Component } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  constructor(private supabase: SupabaseService) {}

  loginWithGoogle() {
    this.supabase.signInWithGoogle();
  }
}
