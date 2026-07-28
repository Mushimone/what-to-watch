import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { SupabaseService } from '../../../core/services/supabase.service';

/** Play requires an in-app deletion path; /delete-account documents the same thing. */
@Component({
  selector: 'app-delete-account-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './delete-account-dialog.html',
  styleUrl: './delete-account-dialog.scss',
})
export class DeleteAccountDialog {
  private supabase = inject(SupabaseService);
  private dialogRef = inject(MatDialogRef<DeleteAccountDialog>);

  confirmation = signal('');
  deleting = signal(false);
  error = signal<string | null>(null);
  /** Typing the word is the whole guard — the action has no undo. */
  confirmed = computed(() => this.confirmation().trim().toUpperCase() === 'DELETE');

  get confirmValue(): string {
    return this.confirmation();
  }
  set confirmValue(value: string) {
    this.confirmation.set(value);
    this.error.set(null);
  }

  async remove(): Promise<void> {
    if (!this.confirmed() || this.deleting()) return;
    this.deleting.set(true);
    const ok = await this.supabase.deleteAccount();
    if (!ok) {
      this.deleting.set(false);
      this.error.set(
        'Could not delete the account. Try again, or email simonerizzo.pvt@gmail.com.',
      );
      return;
    }
    this.dialogRef.close(true);
  }
}
