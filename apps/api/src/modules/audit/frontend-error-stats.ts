import { Prisma } from '@prisma/client';

export const frontendErrorMapSql = Prisma.sql`
  SELECT id, created_at AS "createdAt", event_type AS "eventType", route,
    device #> '{network,geo,latitude}' AS latitude,
    device #> '{network,geo,longitude}' AS longitude
  FROM frontend_error_reports
  WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '29 days') AT TIME ZONE 'UTC'
    AND created_at <= now()
  ORDER BY created_at DESC, id DESC
`;

// Aggregate in Postgres: never transfer messages, stacks or individual users.
// Calendar days and today's count use the same explicit UTC boundary.
export const frontendErrorStatsSql = Prisma.sql`
  WITH reports AS (
    SELECT id, created_at, user_id, event_type, api_status, route, device
    FROM frontend_error_reports
    WHERE created_at >= (date_trunc('day', now() AT TIME ZONE 'UTC') - interval '29 days') AT TIME ZONE 'UTC'
      AND created_at <= now()
  ), dimensions AS (
    SELECT dimension.kind, dimension.label
    FROM reports r
    CROSS JOIN LATERAL (VALUES
      ('types', r.event_type),
      ('http', coalesce(r.api_status::text, 'Sem status HTTP')),
      ('routes', r.route),
      ('versions', coalesce(nullif(r.device->>'appVersion', ''), 'Não informada')),
      ('browsers', coalesce(nullif(r.device->>'browser', ''), 'Não informado')),
      ('systems', coalesce(nullif(r.device->>'os', ''), 'Não informado'))
    ) dimension(kind, label)
  ), ranked AS (
    SELECT kind, label, count(*)::int AS count,
      row_number() OVER (PARTITION BY kind ORDER BY count(*) DESC, label) AS rank
    FROM dimensions GROUP BY kind, label
  )
  SELECT kind, label, count FROM ranked WHERE rank <= 8
  UNION ALL
  SELECT 'timeline', to_char(days.day, 'YYYY-MM-DD'), count(r.id)::int
  FROM generate_series(
    date_trunc('day', now() AT TIME ZONE 'UTC') - interval '29 days',
    date_trunc('day', now() AT TIME ZONE 'UTC'), interval '1 day'
  ) days(day)
  LEFT JOIN reports r ON (r.created_at AT TIME ZONE 'UTC')::date = days.day::date
  GROUP BY days.day
  UNION ALL SELECT 'metrics', 'total', count(*)::int FROM reports
  UNION ALL SELECT 'metrics', 'users', count(DISTINCT user_id)::int FROM reports
  UNION ALL SELECT 'metrics', 'today', count(*)::int FROM reports
    WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
  UNION ALL SELECT 'metrics', 'serverErrors', count(*)::int FROM reports WHERE api_status >= 500
  ORDER BY kind, count DESC, label
`;
