import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetTestState } from '../test/utils';
import { errorLocation } from '../lib/error-location';
import { FrontendErrorDetailMap, FrontendErrorMap } from './FrontendErrorMap';

const leaflet = vi.hoisted(() => ({
  remove: vi.fn(),
  fitBounds: vi.fn(),
  popup: vi.fn(),
  marker: vi.fn(),
}));
vi.mock('leaflet', () => ({
  map: () => ({ remove: leaflet.remove, fitBounds: leaflet.fitBounds }),
  tileLayer: () => ({ addTo: () => ({ on: vi.fn() }) }),
  divIcon: (options: unknown) => options,
  marker: (...args: unknown[]) => {
    leaflet.marker(...args);
    return { addTo: () => ({ bindPopup: leaflet.popup }) };
  },
}));

function show() {
  const onSelect = vi.fn();
  const view = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <FrontendErrorMap onSelect={onSelect} />
    </QueryClientProvider>,
  );
  return { ...view, onSelect };
}
const point = {
  id: 'a',
  latitude: 38.72,
  longitude: -9.14,
  createdAt: '2026-10-27T12:00:00Z',
  eventType: 'api',
  route: '/',
};

describe('Frontend error location maps', () => {
  beforeEach(() => {
    resetTestState();
    vi.clearAllMocks();
  });
  it('groups matching coordinates and permits inspecting every error without HTML injection', async () => {
    mockApi({
      'GET /audit/frontend-errors/map': {
        body: {
          total: 3,
          points: [
            point,
            { ...point, id: 'b', route: '<img src=x onerror=alert(1)>' },
          ],
        },
      },
    });
    const { onSelect, unmount } = show();
    expect(
      await screen.findByText('2 erros no mapa · 1 sem coordenadas'),
    ).toBeInTheDocument();
    await waitFor(() => expect(leaflet.marker).toHaveBeenCalledTimes(1));
    const popup = leaflet.popup.mock.calls[0]![0] as HTMLElement;
    expect(popup.querySelector('img')).toBeNull();
    expect(popup.textContent).toContain('<img src=x onerror=alert(1)>');
    fireEvent.click(popup.querySelectorAll('button')[1]!);
    expect(onSelect).toHaveBeenCalledWith('b');
    unmount();
    expect(leaflet.remove).toHaveBeenCalledTimes(1);
  });
  it('shows empty and unavailable location states for old reports', async () => {
    mockApi({
      'GET /audit/frontend-errors/map': { body: { total: 5, points: [] } },
    });
    show();
    expect(
      await screen.findByText(
        'Ainda não há erros com coordenadas disponíveis.',
      ),
    ).toBeInTheDocument();
    render(<FrontendErrorDetailMap report={{ id: 'old' }} />);
    expect(
      screen.getByText('Este registro não tem coordenadas disponíveis.'),
    ).toBeInTheDocument();
    expect(leaflet.marker).not.toHaveBeenCalled();
  });
  it('shows a map loading failure independently from the error table', async () => {
    mockApi({ 'GET /audit/frontend-errors/map': { status: 500 } });
    show();
    expect(
      await screen.findByText(
        'Não foi possível carregar as localizações dos erros.',
      ),
    ).toBeInTheDocument();
  });
  it('shows the marker in error details and validates coordinates including zero', async () => {
    const report = {
      ...point,
      device: { network: { geo: { latitude: 0, longitude: 0 } } },
    };
    expect(errorLocation(report)).toMatchObject({ latitude: 0, longitude: 0 });
    expect(
      errorLocation({
        device: { network: { geo: { latitude: 999, longitude: 0 } } },
      }),
    ).toBeUndefined();
    render(<FrontendErrorDetailMap report={report} />);
    await waitFor(() => expect(leaflet.marker).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('region', {
        name: 'Mapa de localizações aproximadas dos erros',
      }),
    ).toBeInTheDocument();
  });
});
