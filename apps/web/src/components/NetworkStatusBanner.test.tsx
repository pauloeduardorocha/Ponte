import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NetworkStatusBanner } from './NetworkStatusBanner';

afterEach(() => vi.restoreAllMocks());
it('shows an offline notice and clears it after connectivity returns', () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  render(<NetworkStatusBanner />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  act(() => {
    online.mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
  });
  expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão');
  act(() => {
    online.mockReturnValue(true);
    window.dispatchEvent(new Event('online'));
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
