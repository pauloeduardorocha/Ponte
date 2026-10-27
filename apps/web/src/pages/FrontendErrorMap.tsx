import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, Stack, Typography } from '@mui/material';
import type { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/format';

import { errorLocation, type ErrorMapPoint } from '../lib/error-location';

function ErrorLocationMap({
  points,
  onSelect,
}: {
  points: ErrorMapPoint[];
  onSelect?: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let disposed = false;
    let map: LeafletMap | undefined;
    let observer: ResizeObserver | undefined;
    void import('leaflet')
      .then((L) => {
        if (disposed || !container.current) return;
        map = L.map(container.current, { scrollWheelZoom: false });
        const tiles = L.tileLayer(
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          {
            maxZoom: 18,
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          },
        ).addTo(map);
        tiles.on('tileerror', () => {
          if (!disposed) setFailed(true);
        });
        const groups = new Map<string, ErrorMapPoint[]>();
        for (const point of points) {
          const key = `${point.latitude},${point.longitude}`;
          const group = groups.get(key) ?? [];
          group.push(point);
          groups.set(key, group);
        }
        for (const group of groups.values()) {
          const point = group[0]!;
          const marker = L.marker([point.latitude, point.longitude], {
            title: `${group.length} erro(s) nesta localização aproximada`,
            icon: L.divIcon({
              className: '',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
              html: `<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#1565c0;color:white;border:2px solid white;box-shadow:0 1px 5px #555;font-weight:bold">${group.length}</span>`,
            }),
          }).addTo(map);
          const popup = document.createElement('div');
          popup.style.cssText =
            'max-height:240px;overflow:auto;min-width:180px';
          for (const error of group) {
            const item = document.createElement('p');
            item.textContent = `${formatDateTime(error.createdAt)} · ${error.eventType} · ${error.route}`;
            if (onSelect) {
              const button = document.createElement('button');
              button.type = 'button';
              button.textContent = 'Ver detalhes do erro';
              button.addEventListener('click', () => onSelect(error.id));
              item.append(document.createElement('br'), button);
            }
            popup.append(item);
          }
          marker.bindPopup(popup);
        }
        map.fitBounds(
          points.map(
            (point) => [point.latitude, point.longitude] as [number, number],
          ),
          { padding: [35, 35], maxZoom: 10 },
        );
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(() => map?.invalidateSize());
          observer.observe(container.current);
        }
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      observer?.disconnect();
      map?.remove();
    };
  }, [points, onSelect]);
  return (
    <Stack spacing={1}>
      {failed && (
        <Alert severity="warning">
          Não foi possível carregar parte do mapa. Os valores das localizações
          continuam disponíveis.
        </Alert>
      )}
      <Box
        ref={container}
        role="region"
        aria-label="Mapa de localizações aproximadas dos erros"
        sx={{
          height: { xs: 300, md: 380 },
          width: '100%',
          borderRadius: 1,
          zIndex: 0,
          bgcolor: 'action.hover',
        }}
      />
    </Stack>
  );
}

export function FrontendErrorMap({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const map = useQuery({
    queryKey: ['frontend-error-map'],
    queryFn: () =>
      apiRequest<{ total: number; points: ErrorMapPoint[] }>(
        '/audit/frontend-errors/map',
      ),
  });
  return (
    <Card variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          Mapa dos erros
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Últimos 30 dias de calendário (UTC). Localizações aproximadas por IP.
          Erros na mesma coordenada são agrupados; clique no marcador para
          consultar cada ocorrência.
        </Typography>
        {map.isPending && (
          <Typography role="status">Carregando localizações—</Typography>
        )}
        {map.isError && (
          <Alert severity="warning">
            Não foi possível carregar as localizações dos erros.
          </Alert>
        )}
        {map.data && (
          <>
            <Typography>
              {map.data.points.length} erros no mapa ·{' '}
              {map.data.total - map.data.points.length} sem coordenadas
            </Typography>
            {map.data.points.length ? (
              <ErrorLocationMap points={map.data.points} onSelect={onSelect} />
            ) : (
              <Alert severity="info">
                Ainda não há erros com coordenadas disponíveis.
              </Alert>
            )}
            <Box component="details">
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                Ver ocorrências localizadas
              </Box>
              <Stack
                spacing={1}
                sx={{ maxHeight: 240, overflowY: 'auto', pt: 1 }}
              >
                {map.data.points.map((point) => (
                  <Box key={point.id}>
                    <Typography variant="body2">
                      {formatDateTime(point.createdAt)} · {point.eventType} ·{' '}
                      {point.route} · {point.latitude}, {point.longitude}
                    </Typography>
                    <Button onClick={() => onSelect(point.id)}>
                      Ver detalhes do erro
                    </Button>
                  </Box>
                ))}
              </Stack>
            </Box>
          </>
        )}
      </Stack>
    </Card>
  );
}

export function FrontendErrorDetailMap({
  report,
}: {
  report: Record<string, unknown>;
}) {
  const points = useMemo(() => {
    const point = errorLocation(report);
    return point ? [point] : [];
  }, [report]);
  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <Typography variant="h6" component="h3">
        Localização aproximada
      </Typography>
      {points.length ? (
        <>
          <Typography variant="body2" color="text.secondary">
            Estimativa por IP, não corresponde à posição GPS do dispositivo.
          </Typography>
          <ErrorLocationMap points={points} />
        </>
      ) : (
        <Typography color="text.secondary">
          Este registro não tem coordenadas disponíveis.
        </Typography>
      )}
    </Stack>
  );
}
