/**
 * @jest-environment jsdom
 */
/**
 * Tests for the Report a fault form (RES-02): a report inside my flat or in a common area, "Me too" when a
 * neighbour already reported it (BR-13), the emergency path with 999 first and "Log it for repair" (BR-12), and the
 * API's error shown with what was typed kept. Case IDs are from `docs/test-cases.md`.
 *
 * @author Mahir Al Kamal
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { answerFetchByRoute, type FakeRoute } from '@/components/auth/testFetch';
import { ReportFaultForm } from './ReportFaultForm';
import type { TicketView } from './ticketView';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const OPTIONS: FakeRoute = {
  method: 'GET',
  url: '/api/common-area-places',
  status: 200,
  body: {
    places: [
      { id: 'p-pump', name: 'Water pump' },
      { id: 'p-lift1', name: 'Lift 1' },
    ],
    categories: ['Plumbing', 'Electrical', 'Lift', 'Water supply', 'Fire or gas smell', 'Other'],
  },
};

const NO_MATCH: FakeRoute = {
  method: 'GET',
  url: '/api/tickets/match*',
  status: 200,
  body: { match: null },
};

const CREATED: FakeRoute = {
  method: 'POST',
  url: '/api/tickets',
  status: 201,
  body: { ticket: { id: 't-new' } },
};

const PUMP_TICKET: TicketView = {
  id: 't-pump',
  title: 'No water pressure on floors 5 to 8',
  category: 'Plumbing',
  status: 'Assigned',
  placeId: 'p-pump',
  dueDate: null,
  createdAt: '2026-11-20T04:00:00.000Z',
  updatedAt: '2026-11-20T05:00:00.000Z',
};

function serve(...more: FakeRoute[]): jest.Mock {
  return answerFetchByRoute([OPTIONS, NO_MATCH, CREATED, ...more]);
}

/** The form sent with the last POST to /api/tickets. */
function sentForm(fetch: jest.Mock): FormData {
  const call = [...fetch.mock.calls]
    .reverse()
    .find(([url, init]) => url === '/api/tickets' && init?.method === 'POST');
  if (!call) throw new Error('No report was sent');
  return call[1].body as FormData;
}

beforeEach(() => push.mockClear());

describe('ReportFaultForm: inside my flat', () => {
  it('sends a flat report and goes to My tickets (TC-R02-01)', async () => {
    const fetch = serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Plumbing' }));
    await user.type(screen.getByLabelText('Short title'), 'Kitchen tap leaking');
    await user.type(screen.getByLabelText('Describe the problem'), 'Drips all the time');
    await user.type(screen.getByLabelText('When is someone home?'), 'After 5 pm');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    const form = sentForm(fetch);
    expect(Object.fromEntries(form.entries())).toEqual({
      where: 'flat',
      category: 'Plumbing',
      title: 'Kitchen tap leaking',
      description: 'Drips all the time',
      homeTimes: 'After 5 pm',
    });
    expect(push).toHaveBeenCalledWith('/resident/tickets');
  });

  it('offers every kind but Fire or gas smell, which is an emergency', async () => {
    serve();
    render(<ReportFaultForm />);
    const kinds = within(await screen.findByRole('group', { name: 'What kind?' }));
    expect(await kinds.findByRole('button', { name: 'Plumbing' })).toBeInTheDocument();
    expect(kinds.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Plumbing',
      'Electrical',
      'Lift',
      'Water supply',
      'Other',
    ]);
  });

  it('sends the photo with the report', async () => {
    const fetch = serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'tap.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText('Add a photo (optional)'), photo);
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(sentForm(fetch).get('photo')).toBeInstanceOf(File);
  });

  it("shows the API's message and keeps what was typed (TC-R02-12, TC-R02-25)", async () => {
    serve({
      method: 'POST',
      url: '/api/tickets',
      status: 400,
      body: { error: { code: 'BAD_REQUEST', message: 'Describe the problem' } },
    });
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Short title'), 'Kitchen tap leaking');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    expect(
      await screen.findByText('Describe the problem', { selector: 'div' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Short title')).toHaveValue('Kitchen tap leaking');
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the API's message when the form options can't load", async () => {
    answerFetchByRoute([
      {
        ...OPTIONS,
        status: 403,
        body: {
          error: { code: 'FORBIDDEN', message: 'Only a household account can report a fault.' },
        },
      },
    ]);
    render(<ReportFaultForm />);
    expect(
      await screen.findByText('Only a household account can report a fault.'),
    ).toBeInTheDocument();
  });
});

describe('ReportFaultForm: common area', () => {
  async function pickPumpPlumbing(): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Common area' }));
    await user.click(await screen.findByRole('button', { name: 'Plumbing' }));
    await user.selectOptions(screen.getByLabelText('Place'), 'Water pump');
    return user;
  }

  it('sends a common-area report with its place and no home times (TC-R02-02)', async () => {
    const fetch = serve();
    render(<ReportFaultForm />);
    const user = await pickPumpPlumbing();
    expect(screen.queryByLabelText('When is someone home?')).toBeNull();
    await user.type(screen.getByLabelText('Short title'), 'Pump noise');
    await user.type(screen.getByLabelText('Describe the problem'), 'Loud at night');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    const form = sentForm(fetch);
    expect(form.get('where')).toBe('common');
    expect(form.get('placeId')).toBe('p-pump');
    expect(form.has('homeTimes')).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      '/api/tickets/match?placeId=p-pump&category=Plumbing',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('shows the open ticket with Me too instead of the form (TC-R02-03, TC-R02-04)', async () => {
    const fetch = serve(
      { method: 'GET', url: '/api/tickets/match*', status: 200, body: { match: PUMP_TICKET } },
      {
        method: 'POST',
        url: '/api/tickets/t-pump/followers',
        status: 200,
        body: { followerCount: 7 },
      },
    );
    render(<ReportFaultForm />);
    const user = await pickPumpPlumbing();

    const card = await screen.findByRole('region', { name: 'Already reported by a neighbour' });
    expect(within(card).getByText('No water pressure on floors 5 to 8')).toBeInTheDocument();
    expect(within(card).getByText('Assigned')).toBeInTheDocument();
    expect(screen.queryByLabelText('Describe the problem')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Send report' })).toBeNull();

    await user.click(within(card).getByRole('button', { name: 'Me too: follow this ticket' }));
    expect(fetch).toHaveBeenCalledWith(
      '/api/tickets/t-pump/followers',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(push).toHaveBeenCalledWith('/resident/tickets');
  });

  it("shows the API's message when Me too is refused (TC-R02-09)", async () => {
    serve(
      { method: 'GET', url: '/api/tickets/match*', status: 200, body: { match: PUMP_TICKET } },
      {
        method: 'POST',
        url: '/api/tickets/t-pump/followers',
        status: 409,
        body: {
          error: {
            code: 'CONFLICT',
            message: 'This ticket is finished. Report the fault again if it is back.',
          },
        },
      },
    );
    render(<ReportFaultForm />);
    const user = await pickPumpPlumbing();
    await user.click(await screen.findByRole('button', { name: 'Me too: follow this ticket' }));
    expect(await screen.findByText(/This ticket is finished/)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows Me too when the report itself comes back with a match (BR-13)', async () => {
    serve({ method: 'POST', url: '/api/tickets', status: 200, body: { match: PUMP_TICKET } });
    render(<ReportFaultForm />);
    const user = await pickPumpPlumbing();
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(
      await screen.findByRole('region', { name: 'Already reported by a neighbour' }),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('drops the match when I go back to inside my flat', async () => {
    serve({ method: 'GET', url: '/api/tickets/match*', status: 200, body: { match: PUMP_TICKET } });
    render(<ReportFaultForm />);
    const user = await pickPumpPlumbing();
    await screen.findByRole('region', { name: 'Already reported by a neighbour' });
    await user.click(screen.getByRole('button', { name: 'Inside my flat' }));
    expect(screen.queryByRole('region', { name: 'Already reported by a neighbour' })).toBeNull();
    expect(screen.getByLabelText('Describe the problem')).toBeInTheDocument();
  });
});

describe('ReportFaultForm: emergency path', () => {
  it('shows 999 first, before any form field (TC-R02-10, BR-12)', async () => {
    serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fire or gas smell' }));

    const panel = screen.getByRole('region', { name: 'Fire or gas smell: call first' });
    expect(within(panel).getByRole('link', { name: 'Call 999' })).toHaveAttribute(
      'href',
      'tel:999',
    );
    expect(
      within(panel).getByRole('link', { name: 'Guard desk and manager numbers' }),
    ).toHaveAttribute('href', '/emergency');
    const title = screen.getByLabelText('Short title');
    expect(panel.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sends "Log it for repair" as an emergency fire report (TC-R02-11)', async () => {
    const fetch = serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Fire or gas smell' }));
    await user.click(screen.getByRole('button', { name: 'Log it for repair' }));

    expect(screen.getByText('Emergency: Fire or gas smell')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'What kind?' })).toBeNull();
    expect(screen.getByLabelText('Short title')).toHaveValue('Fire or gas smell');
    await user.type(screen.getByLabelText('Describe the problem'), 'Gas smell in the kitchen');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    const form = sentForm(fetch);
    expect(form.get('category')).toBe('Fire or gas smell');
    expect(form.get('emergency')).toBe('true');
    expect(push).toHaveBeenCalledWith('/resident/tickets');
  });

  it('logs someone stuck in a lift as a common-area Lift emergency', async () => {
    const fetch = serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Someone stuck in a lift' }));
    await user.click(screen.getByRole('button', { name: 'Log it for repair' }));
    await user.selectOptions(await screen.findByLabelText('Place'), 'Lift 1');
    await user.click(screen.getByRole('button', { name: 'Send report' }));

    const form = sentForm(fetch);
    expect(form.get('where')).toBe('common');
    expect(form.get('category')).toBe('Lift');
    expect(form.get('placeId')).toBe('p-lift1');
    expect(form.get('emergency')).toBe('true');
  });

  it('keeps a title already typed when logging the emergency', async () => {
    serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Short title'), 'Smoke in the stairs');
    await user.click(screen.getByRole('button', { name: 'Fire or gas smell' }));
    await user.click(screen.getByRole('button', { name: 'Log it for repair' }));
    expect(screen.getByLabelText('Short title')).toHaveValue('Smoke in the stairs');
  });

  it('starts as an emergency report from the Emergency screen', async () => {
    serve();
    render(<ReportFaultForm emergency="lift" />);
    expect(screen.getByText('Emergency: Someone stuck in a lift')).toBeInTheDocument();
    expect(await screen.findByLabelText('Place')).toBeInTheDocument();
    expect(screen.getByLabelText('Short title')).toHaveValue('Someone stuck in a lift');
  });

  it('goes back to a normal report when it is not an emergency', async () => {
    const fetch = serve();
    render(<ReportFaultForm emergency="fire" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: "It isn't an emergency" }));
    expect(await screen.findByRole('group', { name: 'What kind?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(sentForm(fetch).has('emergency')).toBe(false);
    expect(sentForm(fetch).get('category')).toBe('');
  });

  it('closes the 999 panel without logging anything', async () => {
    serve();
    render(<ReportFaultForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Someone stuck in a lift' }));
    await user.click(screen.getByRole('button', { name: "It isn't an emergency" }));
    expect(screen.queryByRole('region', { name: /call first/ })).toBeNull();
    expect(screen.queryByText(/^Emergency:/)).toBeNull();
  });
});
