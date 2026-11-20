# BariBondhu app

The Next.js app for BariBondhu. Run every command from this `code/` folder with Node.js 24 LTS.

```bash
npm install
npm run dev
```

The full developer guide (setup, environment variables, how to add a feature) comes with the project skeleton PR.

## Demo accounts

`npm run db:seed` fills the database with a demo building, "Bari Bondhu Tower": blocks A and B, flats 1A to 3B in
each, and households in A-1A, A-2B, B-1B and B-3A. It also makes one account per role. It is safe to run again: it
only adds what is missing and puts the demo accounts back to their starting state.

Every demo account uses the password in `SEED_DEMO_PASSWORD` in your `.env.local`. Ask Mahir for it; it is never
written in the repository, because the repository is public.

| Username | Role | Notes |
|---|---|---|
| `bb-resident1` | Resident | Rahman family, flat A-1A |
| `bb-resident2` | Resident | Hossain family, flat B-1B |
| `bb-guard` | Security guard | |
| `bb-manager` | Building manager | |
| `bb-committee` | Committee member | |
| `bb-maintenance` | Maintenance staff | |
| `bb-admin` | System administrator | |
| `bb-firstlogin` | Resident | Chowdhury family, flat A-2B. Must choose a new password at log-in (BR-15). |

Real accounts always get generated usernames like `bb-4k7q2m` (NFR-05). The readable demo names are only for
demos.
