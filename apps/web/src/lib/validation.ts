import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  )
  .max(128, 'A senha deve ter no máximo 128 caracteres.');

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe o e-mail.')
  .pipe(z.email('Informe um e-mail válido.'));

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Informe o nome.')
  .max(120, 'O nome deve ter no máximo 120 caracteres.');
