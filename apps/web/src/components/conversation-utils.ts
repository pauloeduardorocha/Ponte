export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a ação.';

export function personInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
