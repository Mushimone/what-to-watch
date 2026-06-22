import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ProfileService } from '../../../core/services/profile.service';

@Component({
  selector: 'app-username-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './username-dialog.html',
  styleUrl: './username-dialog.scss',
})
export class UsernameDialog {
  private profile = inject(ProfileService);
  private dialogRef = inject(MatDialogRef<UsernameDialog>);

  username = signal('');
  saving = signal(false);
  error = signal<string | null>(null);

  get usernameValue(): string {
    return this.username();
  }
  set usernameValue(value: string) {
    this.username.set(value);
    this.error.set(null);
  }

  async save(): Promise<void> {
    const name = this.username().trim();
    if (name.length < 2) {
      this.error.set('Please enter at least 2 characters.');
      return;
    }
    this.saving.set(true);
    const ok = await this.profile.setUsername(name);
    this.saving.set(false);
    if (!ok) {
      this.error.set('Could not save. Please try again.');
      return;
    }
    this.dialogRef.close(name);
  }
}
