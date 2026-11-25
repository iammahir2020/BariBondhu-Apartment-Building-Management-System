/**
 * @jest-environment jsdom
 */
/**
 * Tests for the administrator's home: the building, blocks, flats and manager account from the API, the empty
 * setup, and the error.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import { answerFetch } from '@/components/auth/testFetch';
import type { BuildingSetup } from '@/services/buildingSetupService';
import { AdminHome, blockLabel } from './AdminHome';

const SETUP: BuildingSetup = {
  building: { name: 'Lakeview Residence', address: 'Road 7, Dhanmondi, Dhaka' },
  blocks: [
    { name: 'Block A', floors: 6, flats: 12 },
    { name: 'Block B', floors: 1, flats: 1 },
  ],
  totalFlats: 13,
  managers: [
    { username: 'bb-manager', displayName: 'Nasir Uddin', active: true, mustChangePassword: true },
    { username: 'old-manager', displayName: 'Rahim', active: false, mustChangePassword: false },
  ],
};

describe('AdminHome', () => {
  it('shows the building, blocks and managers (normal)', async () => {
    const fetch = answerFetch(200, SETUP);
    render(<AdminHome />);

    expect(await screen.findByText('Lakeview Residence')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/buildings', expect.anything());
    expect(screen.getByText('6 floors · 12 flats')).toBeInTheDocument();
    expect(screen.getByText('1 floor · 1 flat')).toBeInTheDocument();
    expect(screen.getByText('13 flats in 2 blocks')).toBeInTheDocument();
    expect(
      screen.getByText('Username bb-manager · must change the temporary password at first login'),
    ).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Deactivated')).toBeInTheDocument();
  });

  it('says what is missing before setup (boundary)', async () => {
    answerFetch(200, { building: null, blocks: [], totalFlats: 0, managers: [] });
    render(<AdminHome />);
    expect(await screen.findByText('No building set up yet.')).toBeInTheDocument();
    expect(screen.getByText('No blocks yet.')).toBeInTheDocument();
    expect(screen.getByText('No manager account yet.')).toBeInTheDocument();
  });

  it('shows the error when the setup fails to load (exception)', async () => {
    answerFetch(500, {
      error: { code: 'INTERNAL', message: 'Something went wrong. Try again in a minute.' },
    });
    render(<AdminHome />);
    expect(
      await screen.findByText('Something went wrong. Try again in a minute.'),
    ).toBeInTheDocument();
  });
});

describe('blockLabel', () => {
  it('puts "Block" in front of a bare name, and leaves a full name alone (normal, boundary)', () => {
    expect(blockLabel('A')).toBe('Block A');
    expect(blockLabel('Block B')).toBe('Block B');
    expect(blockLabel('block c')).toBe('block c');
    expect(blockLabel('Blockade')).toBe('Block Blockade');
  });
});
