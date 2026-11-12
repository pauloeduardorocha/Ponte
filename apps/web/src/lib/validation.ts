import { t as translate } from '../i18n';
import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: () =>
      translate('A senha deve ter pelo menos {0} caracteres.', [
        PASSWORD_MIN_LENGTH,
      ]),
  })
  .max(128, {
    error: () => translate('A senha deve ter no máximo 128 caracteres.'),
  });

export const emailSchema = z
  .string()
  .trim()
  .min(1, { error: () => translate('Informe o e-mail.') })
  .pipe(z.email({ error: () => translate('Informe um e-mail válido.') }));

export const nameSchema = z
  .string()
  .trim()
  .min(1, { error: () => translate('Informe o nome.') })
  .max(120, {
    error: () => translate('O nome deve ter no máximo 120 caracteres.'),
  });
