import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { DeleteAccountDialog } from './delete-account-dialog';
import { SupabaseService } from '../../../core/services/supabase.service';

describe('DeleteAccountDialog', () => {
  let deleteAccount: ReturnType<typeof vi.fn>;
  let close: ReturnType<typeof vi.fn>;

  const build = async () => {
    deleteAccount = vi.fn().mockResolvedValue(true);
    close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [DeleteAccountDialog],
      providers: [
        provideNoopAnimations(),
        { provide: SupabaseService, useValue: { deleteAccount } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    return TestBed.createComponent(DeleteAccountDialog).componentInstance;
  };

  it('will not delete until the confirmation word is typed', async () => {
    const dialog = await build();

    dialog.confirmValue = 'delet';
    await dialog.remove();
    expect(deleteAccount).not.toHaveBeenCalled();

    dialog.confirmValue = ' delete ';
    expect(dialog.confirmed()).toBe(true);
    await dialog.remove();
    expect(deleteAccount).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledWith(true);
  });

  it('stays open and explains itself when the call fails', async () => {
    const dialog = await build();
    deleteAccount.mockResolvedValue(false);

    dialog.confirmValue = 'DELETE';
    await dialog.remove();

    expect(close).not.toHaveBeenCalled();
    expect(dialog.deleting()).toBe(false);
    expect(dialog.error()).toContain('Could not delete');
  });
});
