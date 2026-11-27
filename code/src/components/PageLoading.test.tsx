/**
 * @jest-environment jsdom
 */
/**
 * Tests for the page placeholder shown while a role's next page loads.
 *
 * @author Mahir Al Kamal
 */
import { render, screen } from '@testing-library/react';
import { PageLoading } from './PageLoading';

describe('PageLoading', () => {
  it('tells screen readers the page is loading', () => {
    render(<PageLoading />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('hides the placeholder blocks from screen readers', () => {
    const { container } = render(<PageLoading />);

    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
