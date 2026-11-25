/**
 * @jest-environment jsdom
 */
/**
 * Tests for the বাং button: it opens the "Bangla is coming soon" notice, and OK closes it.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LanguageButton } from './LanguageButton';

describe('LanguageButton', () => {
  it('is a working button, not a disabled one (normal)', () => {
    render(<LanguageButton />);
    expect(screen.getByRole('button', { name: 'বাং: Switch to Bangla' })).toBeEnabled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the coming-soon notice in both languages (normal)', async () => {
    render(<LanguageButton />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'বাং: Switch to Bangla' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('বাংলা শিগগিরই আসছে');
    expect(dialog).toHaveTextContent('Bangla is coming soon');
    expect(dialog).toHaveTextContent('BariBondhu is in English for now.');
  });

  it('closes with OK (boundary)', async () => {
    const user = userEvent.setup();
    render(<LanguageButton />);
    await user.click(screen.getByRole('button', { name: 'বাং: Switch to Bangla' }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes with Escape (boundary)', async () => {
    const user = userEvent.setup();
    render(<LanguageButton />);
    await user.click(screen.getByRole('button', { name: 'বাং: Switch to Bangla' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
