const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Formats a date-only value (YYYY-MM-DD or ISO) without timezone shifts. */
export function formatDateOnly(value: string | null): string {
  if (!value) {
    return '—';
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function initials(name: string | undefined): string {
  return name?.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?';
}

/** Local calendar dates; includes today and the preceding 29 days. */
export function last30Days() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)} ${date.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}
