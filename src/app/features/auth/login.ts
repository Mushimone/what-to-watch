import { Component } from '@angular/core';
import { SupabaseService } from '../../core/services/supabase.service';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-login',
  imports: [MatCardModule, MatButtonModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  constructor(private supabase: SupabaseService) {}

  loginWithGoogle() {
    this.supabase.signInWithGoogle();
  }
}
