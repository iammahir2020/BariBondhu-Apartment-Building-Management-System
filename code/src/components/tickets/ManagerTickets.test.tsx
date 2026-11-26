/**
 * @jest-environment jsdom
 */
/**
 * Tests for the manager's ticket list and BM-06/BM-07 actions (BB-1307).
 *
 * @author Jannatul Ferdus Nishi
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { answerFetchByRoute } from '@/components/auth/testFetch';
import { ManagerTickets } from './ManagerTickets';

const STAFF = [{ id: 'staff-1', displayName: 'Karim Rahman' }];
const OTHER_STAFF = { id: 'staff-2', displayName: 'Ayesha Rahman' };

const REPORTED = {
  id: 'ticket-reported',
  title: 'Lift 2 stuck between floors',
  category: 'Lift',
  status: 'Reported',
  place: 'Lift 2',
  description: 'The lift stopped between floors.',
  photoPath: null,
  homeTimes: null,
  instructions: null,
  foundByStaff: true,
  meTooCount: 4,
  priority: 'Urgent',
  assigneeId: null,
  dueDate: null,
  createdAt: '2026-11-13T12:10:00.000Z',
  updatedAt: '2026-11-13T12:10:00.000Z',
  late: true,
  overdue: false,
};

const ASSIGNED = {
  ...REPORTED,
  id: 'ticket-assigned',
  title: 'Water pump not starting',
  status: 'In progress',
  foundByStaff: false,
  meTooCount: 0,
  assigneeId: 'staff-1',
  dueDate: '2026-11-20',
  late: false,
  overdue: true,
};

const FIXED = {
  ...ASSIGNED,
  id: 'ticket-fixed',
  title: 'Corridor socket sparking',
  status: 'Fixed',
  meTooCount: 0,
  dueDate: '2026-11-25',
  overdue: false,
};

const CLOSED = {
  ...FIXED,
  id: 'ticket-closed',
  title: 'Old water leak',
  status: 'Closed',
};

const DUPLICATE = {
  ...REPORTED,
  id: 'ticket-duplicate',
  title: 'Duplicate leak report',
  status: 'Duplicate',
  foundByStaff: false,
  meTooCount: 0,
  late: false,
};

const WITH_PHOTO = { ...REPORTED, photoPath: 'tickets/lift-photo.jpg' };

function listResponse(
  tickets: object[] = [REPORTED, ASSIGNED, FIXED, CLOSED],
  maintenanceStaff = STAFF,
) {
  return { tickets, maintenanceStaff };
}

function detailsResponse(ticket: Record<string, unknown> = REPORTED) {
  return {
    ticket: {
      ticket,
      statusChanges: [
        {
          fromStatus: null,
          toStatus: 'Reported',
          reason: null,
          changedAt: '2026-11-13T12:10:00.000Z',
          changedByName: 'Resident',
        },
        {
          fromStatus: 'Assigned',
          toStatus: 'In progress',
          reason: null,
          changedAt: '2026-11-14T12:10:00.000Z',
          changedByName: 'Karim Rahman',
        },
      ],
      workNotes: [
        {
          id: 'note-1',
          text: 'Checked the motor connection.',
          createdAt: '2026-11-14T12:20:00.000Z',
          authorName: 'Karim Rahman',
        },
      ],
    },
  };
}

describe('ManagerTickets', () => {
  it('shows the BM-06 ticket content and late/overdue markers in the list', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse(),
      },
    ]);

    render(<ManagerTickets />);

    expect(await screen.findByText('Lift 2 stuck between floors')).toBeInTheDocument();
    expect(screen.getByText('Found by staff')).toBeInTheDocument();
    expect(screen.getByText('Me too: 4')).toBeInTheDocument();
    expect(screen.getByText('Late')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('Fixed, to close')).toBeInTheDocument();
  });

  it('filters open, reported, fixed-to-close and closed tickets', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([REPORTED, ASSIGNED, FIXED, CLOSED, DUPLICATE]),
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets />);

    await screen.findByText('Lift 2 stuck between floors');
    expect(screen.queryByText('Old water leak')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reported/ }));
    expect(screen.getByText('Lift 2 stuck between floors')).toBeInTheDocument();
    expect(screen.queryByText('Water pump not starting')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Fixed, to close/ }));
    expect(screen.getByText('Corridor socket sparking')).toBeInTheDocument();
    expect(screen.queryByText('Lift 2 stuck between floors')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Closed/ }));
    expect(screen.getByText('Old water leak')).toBeInTheDocument();
    expect(screen.queryByText('Corridor socket sparking')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(screen.getByText('Duplicate leak report')).toBeInTheDocument();
  });

  it('requires staff and a due date before assigning a Reported ticket', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([REPORTED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${REPORTED.id}`,
        status: 200,
        body: detailsResponse(REPORTED),
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={REPORTED.id} />);

    await screen.findByText('Assign maintenance staff');
    await user.click(screen.getByRole('button', { name: 'Assign ticket' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose a staff member and a due date',
    );
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/assign'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('assigns a Reported ticket with its selected staff, priority, due date and instructions', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([REPORTED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${REPORTED.id}`,
        status: 200,
        body: detailsResponse(REPORTED),
      },
      {
        method: 'POST',
        url: `/api/manager/tickets/${REPORTED.id}/assign`,
        status: 200,
        body: { ticketId: REPORTED.id, status: 'Assigned' },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={REPORTED.id} />);

    await screen.findByText('Assign maintenance staff');
    await user.selectOptions(screen.getByLabelText('Staff member'), 'staff-1');
    await user.selectOptions(screen.getByLabelText('Priority'), 'Urgent');
    await user.type(screen.getByLabelText('Due date'), '2026-12-01');
    await user.type(screen.getByLabelText('Instructions (optional)'), 'Check the lift motor.');
    await user.click(screen.getByRole('button', { name: 'Assign ticket' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/manager/tickets/${REPORTED.id}/assign`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            staffId: 'staff-1',
            priority: 'Urgent',
            dueDate: '2026-12-01',
            instructions: 'Check the lift motor.',
          }),
        }),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ticket assigned successfully.');
  });

  it('reassigns an open ticket without changing its status', async () => {
    const staff = [...STAFF, OTHER_STAFF];
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([ASSIGNED], staff),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${ASSIGNED.id}`,
        status: 200,
        body: detailsResponse(ASSIGNED),
      },
      {
        method: 'POST',
        url: `/api/manager/tickets/${ASSIGNED.id}/reassign`,
        status: 200,
        body: { ticketId: ASSIGNED.id, status: 'In progress', assigneeId: OTHER_STAFF.id },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={ASSIGNED.id} />);

    await screen.findAllByText('Water pump not starting');
    await user.click(screen.getByRole('button', { name: 'Reassign staff' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('The ticket status will not change.');
    await user.click(within(dialog).getByRole('button', { name: 'Reassign ticket' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Choose a different maintenance staff member.',
    );

    await user.selectOptions(
      within(dialog).getByLabelText('New maintenance staff'),
      OTHER_STAFF.id,
    );
    await user.click(within(dialog).getByRole('button', { name: 'Reassign ticket' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/manager/tickets/${ASSIGNED.id}/reassign`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ staffId: OTHER_STAFF.id }),
        }),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ticket reassigned. Its status was kept.',
    );
    expect(await screen.findAllByText('In progress')).not.toHaveLength(0);
  });

  it('explains when no other active maintenance staff can receive the ticket', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([ASSIGNED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${ASSIGNED.id}`,
        status: 200,
        body: detailsResponse(ASSIGNED),
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={ASSIGNED.id} />);

    await user.click(await screen.findByRole('button', { name: 'Reassign staff' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('No other active maintenance staff are available.');
    expect(within(dialog).getByRole('button', { name: 'Reassign ticket' })).toBeDisabled();
  });

  it('shows status history, work notes and closes a Fixed ticket after confirmation', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([FIXED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${FIXED.id}`,
        status: 200,
        body: detailsResponse(FIXED),
      },
      {
        method: 'POST',
        url: `/api/manager/tickets/${FIXED.id}/close`,
        status: 200,
        body: { ticketId: FIXED.id, status: 'Closed' },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={FIXED.id} />);

    expect(await screen.findByText('Status history')).toBeInTheDocument();
    expect(screen.getByText('Checked the motor connection.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close ticket' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('A Closed ticket cannot be reopened.');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm close' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/manager/tickets/${FIXED.id}/close`,
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Ticket closed.');
  });

  it('requires a reason to reopen a Fixed ticket and sends it to the API', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([FIXED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${FIXED.id}`,
        status: 200,
        body: detailsResponse(FIXED),
      },
      {
        method: 'POST',
        url: `/api/manager/tickets/${FIXED.id}/reopen`,
        status: 200,
        body: { ticketId: FIXED.id, status: 'Assigned' },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={FIXED.id} />);

    await screen.findByRole('button', { name: 'Reopen ticket' });
    await user.click(screen.getByRole('button', { name: 'Reopen ticket' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reopen ticket' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Give a reason.');
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/reopen'),
      expect.objectContaining({ method: 'POST' }),
    );

    await user.type(within(dialog).getByLabelText('Reason'), 'The leak has returned.');
    await user.click(within(dialog).getByRole('button', { name: 'Reopen ticket' }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/manager/tickets/${FIXED.id}/reopen`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: 'The leak has returned.' }),
        }),
      );
    });
  });

  it('links a duplicate to another open ticket with a reason', async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([REPORTED, ASSIGNED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${REPORTED.id}`,
        status: 200,
        body: detailsResponse(REPORTED),
      },
      {
        method: 'POST',
        url: `/api/manager/tickets/${REPORTED.id}/decision`,
        status: 200,
        body: { ticketId: REPORTED.id, status: 'Duplicate' },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={REPORTED.id} />);

    await user.click(await screen.findByRole('button', { name: 'Mark Duplicate' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Original ticket'), ASSIGNED.id);
    await user.type(within(dialog).getByLabelText('Reason'), 'Same pump failure.');
    await user.click(within(dialog).getByRole('button', { name: 'Mark Duplicate' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/manager/tickets/${REPORTED.id}/decision`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: 'Duplicate',
            originalTicketId: ASSIGNED.id,
            reason: 'Same pump failure.',
          }),
        }),
      );
    });
  });

  it("marks a Reported ticket Won't fix with a reason", async () => {
    const fetch = answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([REPORTED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${REPORTED.id}`,
        status: 200,
        body: detailsResponse(REPORTED),
      },
      {
        method: 'POST',
        url: `/api/manager/tickets/${REPORTED.id}/decision`,
        status: 200,
        body: { ticketId: REPORTED.id, status: "Won't fix" },
      },
    ]);
    const user = userEvent.setup();
    render(<ManagerTickets selectedTicketId={REPORTED.id} />);

    await user.click(await screen.findByRole('button', { name: "Won't fix" }));
    const dialog = screen.getByRole('dialog');
    await user.type(
      within(dialog).getByLabelText('Reason'),
      'The reported source is not repairable.',
    );
    await user.click(within(dialog).getByRole('button', { name: "Mark Won't fix" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `/api/manager/tickets/${REPORTED.id}/decision`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            decision: "Won't fix",
            reason: 'The reported source is not repairable.',
          }),
        }),
      );
    });
  });

  it('loads a private ticket photo through its signed-photo API route', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([WITH_PHOTO]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${WITH_PHOTO.id}`,
        status: 200,
        body: detailsResponse(WITH_PHOTO),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${WITH_PHOTO.id}/photo`,
        status: 200,
        body: { url: 'https://storage.example.test/lift-photo.jpg' },
      },
    ]);
    render(<ManagerTickets selectedTicketId={WITH_PHOTO.id} />);

    expect(
      await screen.findByRole('img', { name: 'Photo for Lift 2 stuck between floors' }),
    ).toBeInTheDocument();
  });

  it('does not offer reopening after a ticket is Closed', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([CLOSED]),
      },
      {
        method: 'GET',
        url: `/api/manager/tickets/${CLOSED.id}`,
        status: 200,
        body: detailsResponse(CLOSED),
      },
    ]);
    render(<ManagerTickets selectedTicketId={CLOSED.id} />);

    expect(await screen.findByText('Old water leak')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen ticket' })).not.toBeInTheDocument();
  });

  it('shows API permission failures and the empty-list state', async () => {
    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 403,
        body: { error: { code: 'FORBIDDEN', message: 'You cannot manage tickets.' } },
      },
    ]);
    const { unmount } = render(<ManagerTickets />);
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot manage tickets.');
    unmount();

    answerFetchByRoute([
      {
        method: 'GET',
        url: '/api/manager/tickets',
        status: 200,
        body: listResponse([]),
      },
    ]);
    render(<ManagerTickets />);
    expect(await screen.findByText('No tickets have been reported.')).toBeInTheDocument();
  });
});
