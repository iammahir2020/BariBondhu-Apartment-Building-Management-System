/**
 * @jest-environment jsdom
 */
/**
 * Tests for Resident home (BB-0612): the bill card with Pay now and See bill, its settled and empty states, the
 * tiles, the latest guest pass and ticket rows, and a failing list not hiding the others.
 *
 * @author Mahir Al Kamal
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MyTicketView } from '@/components/tickets/ticketView';
import type { GuestPassView } from '@/lib/guestPassResponse';
import type { MyBillView } from '@/services/myBillsService';
import { ResidentHome } from './ResidentHome';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const BILL: MyBillView = {
  id: 'bill-nov',
  billingMonth: '2026-11-01',
  dueDate: '2026-11-20',
  totalPoisha: 485_000,
  status: 'Unpaid',
  lines: [],
  canPay: true,
  paymentProblem: null,
  receiptNumber: null,
};

const PASS: GuestPassView = {
  id: 'pass-1',
  guestName: 'Rafiq Hasan',
  guestCount: 4,
  guestsUsed: 2,
  startsAt: '2026-11-25T11:00:00.000Z',
  endsAt: '2026-11-25T17:00:00.000Z',
  code: '482913',
  status: 'Partly used',
  cancelledAt: null,
};

const TICKET: MyTicketView = {
  ticket: {
    id: 'ticket-1',
    title: 'Kitchen tap leaking',
    category: 'Plumbing',
    status: 'Assigned',
    placeId: null,
    dueDate: '2026-11-28',
    createdAt: '2026-11-20T04:00:00.000Z',
    updatedAt: '2026-11-21T04:00:00.000Z',
  },
  placeName: null,
  followerCount: 1,
  reportedByMe: true,
};

type Reply = [number, unknown];

/**
 * Answers each route with its own reply, so the order the three lists load in doesn't matter.
 * @param routes - The reply per `METHOD url`.
 * @returns The fetch mock.
 */
function routes(replies: Record<string, Reply>): jest.Mock {
  const mock = jest.fn(async (url: string, init?: RequestInit) => {
    const [status, body] = replies[`${init?.method ?? 'GET'} ${url}`] ?? [500, {}];
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/** The three lists home loads, each answered with the given items unless replaced. */
function homeRoutes(extra: Record<string, Reply> = {}): jest.Mock {
  return routes({
    'GET /api/bills/mine': [200, { bills: [BILL] }],
    'GET /api/guest-passes': [200, { passes: [PASS] }],
    'GET /api/tickets': [200, { tickets: [TICKET] }],
    ...extra,
  });
}

beforeEach(() => {
  push.mockClear();
  jest.useFakeTimers({ now: new Date('2026-11-15T06:00:00Z'), advanceTimers: true });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('ResidentHome', () => {
  it('shows the bill to pay with its amount, due date and days left', async () => {
    homeRoutes();
    render(<ResidentHome />);

    const card = await screen.findByRole('region', { name: 'November 2026 bill' });
    expect(within(card).getByText('৳4,850.00')).toBeInTheDocument();
    expect(within(card).getByText('Due 20 Nov 2026 · 5 days left')).toBeInTheDocument();
    expect(within(card).getByText('Unpaid')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'See bill' })).toHaveAttribute(
      'href',
      '/resident/dues',
    );
  });

  it('Pay now starts the payment and goes straight to the checkout (NFR-24)', async () => {
    const fetch = homeRoutes({
      'POST /api/bills/bill-nov/payments': [201, { checkoutUrl: '/sim-gateway/checkout/SIM-1' }],
    });
    render(<ResidentHome />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pay now' }));

    expect(fetch).toHaveBeenCalledWith(
      '/api/bills/bill-nov/payments',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(push).toHaveBeenCalledWith('/sim-gateway/checkout/SIM-1');
  });

  it('shows the refusal on the card when Pay now is refused', async () => {
    homeRoutes({
      'POST /api/bills/bill-nov/payments': [
        409,
        { error: { code: 'CONFLICT', message: 'This bill already has a payment in progress' } },
      ],
    });
    render(<ResidentHome />);

    await userEvent.setup().click(await screen.findByRole('button', { name: 'Pay now' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This bill already has a payment in progress',
    );
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeEnabled();
  });

  it('offers no Pay now while a payment is pending (BR-03)', async () => {
    homeRoutes({
      'GET /api/bills/mine': [
        200,
        { bills: [{ ...BILL, status: 'Payment pending', canPay: false }] },
      ],
    });
    render(<ResidentHome />);

    const card = await screen.findByRole('region', { name: 'November 2026 bill' });
    expect(within(card).getByText('Due 20 Nov 2026 · payment in progress')).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Pay now' })).not.toBeInTheDocument();
  });

  it('says a cash payment is being checked while Awaiting verification', async () => {
    homeRoutes({
      'GET /api/bills/mine': [
        200,
        { bills: [{ ...BILL, status: 'Awaiting verification', canPay: false }] },
      ],
    });
    render(<ResidentHome />);

    expect(
      await screen.findByText('Due 20 Nov 2026 · cash payment being checked'),
    ).toBeInTheDocument();
  });

  it('says nothing is due when every bill is settled', async () => {
    homeRoutes({ 'GET /api/bills/mine': [200, { bills: [{ ...BILL, status: 'Paid' }] }] });
    render(<ResidentHome />);

    expect(
      await screen.findByText('Nothing to pay. All your bills are settled.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See bills' })).toHaveAttribute(
      'href',
      '/resident/dues',
    );
  });

  it('says there are no bills yet for a new household', async () => {
    homeRoutes({ 'GET /api/bills/mine': [200, { bills: [] }] });
    render(<ResidentHome />);

    expect(await screen.findByText('No bills yet.')).toBeInTheDocument();
  });

  it('links the New guest pass and Report a fault tiles', async () => {
    homeRoutes();
    render(<ResidentHome />);

    expect(await screen.findByRole('link', { name: 'New guest pass' })).toHaveAttribute(
      'href',
      '/resident/guest-passes',
    );
    expect(screen.getByRole('link', { name: 'Report a fault' })).toHaveAttribute(
      'href',
      '/resident/report-fault',
    );
  });

  it('shows the latest guest pass and ticket, each opening its page', async () => {
    homeRoutes();
    render(<ResidentHome />);

    const passRow = await screen.findByRole('link', { name: /Rafiq Hasan \+ 3/ });
    expect(passRow).toHaveAttribute('href', '/resident/guest-passes/pass-1');
    expect(within(passRow).getByText('2 of 4 arrived')).toBeInTheDocument();
    expect(within(passRow).getByText('Partly used')).toBeInTheDocument();

    const ticketRow = screen.getByRole('link', { name: /Kitchen tap leaking/ });
    expect(ticketRow).toHaveAttribute('href', '/resident/tickets');
    expect(within(ticketRow).getByText('Due 28 Nov')).toBeInTheDocument();
    expect(within(ticketRow).getByText('Assigned')).toBeInTheDocument();
  });

  it('leaves the latest list out when there are no passes or tickets', async () => {
    homeRoutes({
      'GET /api/guest-passes': [200, { passes: [] }],
      'GET /api/tickets': [200, { tickets: [] }],
    });
    render(<ResidentHome />);

    await screen.findByRole('region', { name: 'November 2026 bill' });
    expect(screen.queryByRole('list', { name: 'Latest' })).not.toBeInTheDocument();
  });

  it('shows a failing list as an error without hiding the others', async () => {
    homeRoutes({
      'GET /api/guest-passes': [
        500,
        { error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } },
      ],
    });
    render(<ResidentHome />);

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'November 2026 bill' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /Kitchen tap leaking/ })).toBeInTheDocument();
  });

  it('shows the error in place of the bill card when bills fail to load', async () => {
    homeRoutes({
      'GET /api/bills/mine': [
        403,
        { error: { code: 'FORBIDDEN', message: 'You do not have permission to do this.' } },
      ],
    });
    render(<ResidentHome />);

    expect(await screen.findByText('You do not have permission to do this.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'November 2026 bill' })).not.toBeInTheDocument();
  });
});
