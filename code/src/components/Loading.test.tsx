/**
 * @jest-environment jsdom
 */
/**
 * Tests for the shared loading placeholders: what screen readers hear, the number of rows, the card option, and the
 * "Still loading…" note after a slow wait.
 *
 * @author Mahir Al Kamal
 */
import { act, render, screen } from '@testing-library/react';
import { LoadingBlock, LoadingInline, LoadingLine, LoadingRows, SLOW_AFTER_MS } from './Loading';

afterEach(() => {
  jest.useRealTimers();
});

describe('LoadingRows', () => {
  it('announces its label as a status and draws the asked number of rows', () => {
    const { container } = render(<LoadingRows label="Loading tickets…" rows={4} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading tickets…');
    expect(container.querySelectorAll('li')).toHaveLength(4);
  });

  it('says Loading… when no label is given', () => {
    render(<LoadingRows />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });

  it('draws no rows for 0 (boundary)', () => {
    const { container } = render(<LoadingRows rows={0} />);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });

  it('leaves out its own card inside an existing card', () => {
    const { container } = render(<LoadingRows card={false} />);
    expect(container.querySelector('ul')).not.toHaveClass('border');
  });

  it(`adds "Still loading…" only after ${SLOW_AFTER_MS} ms (boundary)`, () => {
    jest.useFakeTimers();
    render(<LoadingRows />);
    act(() => jest.advanceTimersByTime(SLOW_AFTER_MS - 1));
    expect(screen.queryByText('Still loading…')).not.toBeInTheDocument();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByText('Still loading…')).toBeInTheDocument();
  });

  it('stops its timer when the data arrives first (exception)', () => {
    jest.useFakeTimers();
    const { unmount } = render(<LoadingRows />);
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('LoadingBlock', () => {
  it('announces its label and says Still loading… when slow', () => {
    jest.useFakeTimers();
    render(<LoadingBlock label="Loading the pass…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the pass…');
    act(() => jest.advanceTimersByTime(SLOW_AFTER_MS));
    expect(screen.getByText('Still loading…')).toBeInTheDocument();
  });
});

describe('LoadingLine', () => {
  it('announces its label', () => {
    render(<LoadingLine label="Loading the rate…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading the rate…');
  });
});

describe('LoadingInline', () => {
  it('shows its text next to a spinner hidden from screen readers', () => {
    const { container } = render(<LoadingInline label="Loading photo…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading photo…');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});
