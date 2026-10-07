const GENERIC_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : GENERIC_MESSAGE;
}
