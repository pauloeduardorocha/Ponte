import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrontendErrorBoundary } from './FrontendErrorBoundary';
import { checkForAppUpdate, UPDATE_MESSAGE } from '../lib/app-update';
import { reportFrontendError } from '../lib/frontend-error-reporting';

vi.mock('../lib/app-update', () => ({
  checkForAppUpdate: vi.fn(),
  UPDATE_MESSAGE: 'Atualização disponível para continuar.',
}));
vi.mock('../lib/frontend-error-reporting', () => ({
  reportFrontendError: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Broken(): never {
  throw new Error('Internal details');
}

describe('Frontend render failure recovery', () => {
  it.each(['99.0.0', null])(
    'checks for updates before showing a fallback (%s)',
    async (version) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let finish!: (version: string | null) => void;
      vi.mocked(checkForAppUpdate).mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      render(
        <FrontendErrorBoundary>
          <Broken />
        </FrontendErrorBoundary>,
      );
      expect(screen.getByRole('status')).toHaveTextContent('Verificando');
      expect(screen.queryByText('Internal details')).not.toBeInTheDocument();
      finish(version);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        version ? UPDATE_MESSAGE : 'Não foi possível carregar esta tela',
      );
      expect(reportFrontendError).toHaveBeenCalledWith(
        'runtime',
        'Internal details',
        expect.objectContaining({ stack: expect.stringContaining('Broken') }),
      );
    },
  );
});
