# API routes (controllers)

One folder per resource, named as a plural noun: `api/bills/route.ts` serves `/api/bills`.

Every handler does the same four things and nothing else:

1. Check the role first with `requireRole(request, action)`. "Own" actions also check the flat or ticket.
2. Read and check the input. No `any`: parse unknown data and narrow it.
3. Call a service in `src/services/`.
4. Return JSON. Errors go through `toErrorResponse` from `src/lib/errors.ts`.

Pages call these routes with `fetch('/api/...')`. We don't use server actions.
