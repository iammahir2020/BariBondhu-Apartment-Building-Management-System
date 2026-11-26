-- Seed the next seven days of demo guard shifts.
-- If the demo guard profiles do not exist yet, seedShifts.ts will add the shifts
-- after seed.ts creates the accounts.

WITH required_guards AS (
  SELECT id, username
  FROM public.profiles
  WHERE username IN ('bb-guard-hanif', 'bb-guard', 'bb-guard-babul')
    AND role = 'guard'
    AND active = true
),
guard_check AS (
  SELECT COUNT(*) = 3 AS all_guards_exist
  FROM required_guards
),
roster (day_offset, shift_offset, guard_username, duration_hours) AS (
  VALUES
    (0, 0, 'bb-guard-hanif', 8),
    (0, 8, 'bb-guard', 8),
    (0, 16, 'bb-guard-babul', 8),
    (1, 0, 'bb-guard-babul', 8),
    (1, 8, 'bb-guard-hanif', 8),
    (1, 16, 'bb-guard', 8),
    (2, 0, 'bb-guard-babul', 8),
    (2, 8, 'bb-guard-hanif', 8),
    (2, 16, 'bb-guard', 4),
    (3, 0, 'bb-guard-hanif', 8),
    (3, 8, 'bb-guard', 8),
    (3, 16, 'bb-guard-babul', 8),
    (4, 0, 'bb-guard-babul', 8),
    (4, 8, 'bb-guard-hanif', 8),
    (4, 16, 'bb-guard', 8),
    (5, 0, 'bb-guard-hanif', 8),
    (5, 8, 'bb-guard', 8),
    (5, 16, 'bb-guard-babul', 8),
    (6, 0, 'bb-guard-babul', 8),
    (6, 8, 'bb-guard-hanif', 8),
    (6, 16, 'bb-guard', 8)
),
plans AS (
  SELECT
    guards.id AS guard_id,
    (
      (
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Dhaka')
        + INTERVAL '6 hours'
        + roster.day_offset * INTERVAL '1 day'
        + roster.shift_offset * INTERVAL '1 hour'
      ) AT TIME ZONE 'Asia/Dhaka'
    ) AS starts_at,
    (
      (
        date_trunc('day', NOW() AT TIME ZONE 'Asia/Dhaka')
        + INTERVAL '6 hours'
        + roster.day_offset * INTERVAL '1 day'
        + (roster.shift_offset + roster.duration_hours) * INTERVAL '1 hour'
      ) AT TIME ZONE 'Asia/Dhaka'
    ) AS ends_at
  FROM roster
  JOIN required_guards AS guards
    ON guards.username = roster.guard_username
  CROSS JOIN guard_check
  WHERE guard_check.all_guards_exist
)
INSERT INTO public.shifts (guard_id, starts_at, ends_at, status)
SELECT
  plans.guard_id,
  plans.starts_at,
  plans.ends_at,
  CASE
    WHEN plans.ends_at <= NOW() THEN 'Finished'::public.shift_status
    WHEN plans.starts_at <= NOW() THEN 'On duty'::public.shift_status
    ELSE 'Planned'::public.shift_status
  END
FROM plans
WHERE
  -- Never recreate an exact shift, even if it was intentionally removed.
  NOT EXISTS (
    SELECT 1
    FROM public.shifts AS existing
    WHERE existing.guard_id = plans.guard_id
      AND existing.starts_at = plans.starts_at
  )
  -- Do not create a shift that overlaps another active shift for this guard.
  AND NOT EXISTS (
    SELECT 1
    FROM public.shifts AS existing
    WHERE existing.guard_id = plans.guard_id
      AND existing.status <> 'Removed'
      AND existing.starts_at < plans.ends_at
      AND existing.ends_at > plans.starts_at
  );
