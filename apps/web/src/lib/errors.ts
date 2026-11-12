import { t as translate } from '../i18n';
const GENERIC_MESSAGE = translate(
  'Ocorreu um erro inesperado. Tente novamente.',
);

export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? translate(error.message)
    : translate(GENERIC_MESSAGE);
}
