const dateFormatter = new Intl.DateTimeFormat('pt-BR');

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
