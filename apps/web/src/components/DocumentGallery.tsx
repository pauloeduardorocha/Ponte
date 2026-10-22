import { useEffect, useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CircularProgress,
  Dialog,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ZoomInRounded from '@mui/icons-material/ZoomInRounded';
import ZoomOutRounded from '@mui/icons-material/ZoomOutRounded';
import DescriptionRounded from '@mui/icons-material/DescriptionRounded';
import { getAccessToken, refreshSession } from '../lib/api';
import { PdfPreview } from './PdfPreview';

export type PreviewDocument = {
  id: string;
  filename: string;
  mime?: string;
  caption?: string;
  size?: number;
  file?: File;
  path?: string;
  ranged?: boolean;
};
async function loadPrivateDocument(
  path: string,
  signal: AbortSignal,
  size?: number,
) {
  const send = (token: string | null, range?: string) =>
    fetch(`${import.meta.env.VITE_API_URL ?? '/api/v1'}${path}`, {
      signal,
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(range ? { Range: range } : {}),
      },
    });
  const request = async (range?: string) => {
    let response = await send(getAccessToken(), range);
    if (response.status === 401 && getAccessToken()) {
      const session = await refreshSession();
      if (session) response = await send(session.accessToken, range);
    }
    if (!response.ok)
      throw new Error(
        'N\u00e3o foi poss\u00edvel carregar este documento. Tente novamente.',
      );
    return response;
  };
  if (size && size > 2 * 1024 * 1024) {
    const chunks: Blob[] = [];
    let type = '';
    for (let offset = 0; offset < size; offset += 2 * 1024 * 1024) {
      const end = Math.min(size - 1, offset + 2 * 1024 * 1024 - 1);
      const response = await request(`bytes=${offset}-${end}`);
      const chunk = await response.blob();
      if (response.status !== 206 || chunk.size !== end - offset + 1)
        throw new Error('Resposta de arquivo incompleta.');
      type = chunk.type;
      chunks.push(chunk);
    }
    return new Blob(chunks, { type });
  }
  return (await request()).blob();
}

function useDocument(document: PreviewDocument, scope: string) {
  return useQuery({
    queryKey: ['private-document', document.path ?? scope, document.id],
    queryFn: ({ signal }) =>
      document.file
        ? Promise.resolve(document.file)
        : document.path
          ? loadPrivateDocument(
              document.path,
              signal,
              document.ranged ? document.size : undefined,
            )
          : Promise.reject(new Error('Documento indisponível')),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}
function useObjectUrl(blob?: Blob) {
  const [source, setSource] = useState<{ blob: Blob; url: string }>();
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setSource({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return source?.blob === blob ? source?.url : undefined;
}
function mimeType(document: PreviewDocument) {
  if (
    document.mime &&
    ['image/jpeg', 'image/png', 'application/pdf'].includes(document.mime)
  )
    return document.mime;
  return /\.pdf$/i.test(document.filename)
    ? 'application/pdf'
    : /\.png$/i.test(document.filename)
      ? 'image/png'
      : /\.jpe?g$/i.test(document.filename)
        ? 'image/jpeg'
        : '';
}
function DocumentContent({
  document,
  scope,
  thumbnail = false,
  zoom = 1,
}: {
  document: PreviewDocument;
  scope: string;
  thumbnail?: boolean;
  zoom?: number;
}) {
  const result = useDocument(document, scope);
  const url = useObjectUrl(result.data);
  const mime = mimeType(document);
  if (result.isPending)
    return (
      <CircularProgress
        size={thumbnail ? 24 : 40}
        aria-label={`A carregar ${document.filename}`}
      />
    );
  if (result.error)
    return thumbnail ? (
      <DescriptionRounded color="disabled" sx={{ fontSize: 48 }} />
    ) : (
      <Alert
        severity="error"
        action={
          <Button onClick={() => void result.refetch()}>
            Tentar novamente
          </Button>
        }
      >
        {result.error.message}
      </Alert>
    );
  if (mime === 'application/pdf' && result.data)
    return <PdfPreview blob={result.data} thumbnail={thumbnail} zoom={zoom} />;
  if (mime.startsWith('image/') && url)
    return (
      <Box
        component="img"
        src={url}
        alt={document.filename}
        loading={thumbnail ? 'lazy' : 'eager'}
        sx={{
          display: 'block',
          width: '100%',
          maxWidth: '100%',
          height: thumbnail ? 152 : `calc((100dvh - 180px) * ${zoom})`,
          objectFit: 'contain',
        }}
      />
    );
  return <DescriptionRounded color="disabled" sx={{ fontSize: 48 }} />;
}
function FullDocument({
  document,
  scope,
  onClose,
  onPrevious,
  onNext,
  position,
}: {
  document: PreviewDocument;
  scope: string;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position: string;
}) {
  const [zoom, setZoom] = useState(1);
  const result = useDocument(document, scope);
  const url = useObjectUrl(result.data);
  return (
    <>
      <Toolbar
        sx={{
          gap: 1,
          flexWrap: 'wrap',
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography
          id="document-preview-title"
          sx={{ flex: 1, minWidth: 100, overflowWrap: 'anywhere' }}
        >
          {document.filename}
        </Typography>
        <IconButton
          aria-label="Reduzir zoom"
          disabled={zoom <= 1}
          onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
        >
          <ZoomOutRounded />
        </IconButton>
        <Button onClick={() => setZoom(1)} aria-label="Repor zoom">
          {Math.round(zoom * 100)}%
        </Button>
        <IconButton
          aria-label="Aumentar zoom"
          disabled={zoom >= 3}
          onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
        >
          <ZoomInRounded />
        </IconButton>
        <Button
          component="a"
          href={url}
          download={document.filename}
          aria-disabled={!url}
          sx={{ pointerEvents: url ? 'auto' : 'none' }}
        >
          Descarregar
        </Button>
        <IconButton aria-label="Fechar visualização" onClick={onClose}>
          <CloseRounded />
        </IconButton>
      </Toolbar>
      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          bgcolor: 'action.hover',
          p: { xs: 1, sm: 3 },
        }}
      >
        <Box
          sx={{
            width: `${zoom * 100}%`,
            minHeight: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}
        >
          <DocumentContent document={document} scope={scope} zoom={zoom} />
        </Box>
      </Box>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="center"
        spacing={2}
        sx={{ p: 1 }}
      >
        <Button disabled={!onPrevious} onClick={onPrevious}>
          Anexo anterior
        </Button>
        <Typography variant="caption">{position}</Typography>
        <Button disabled={!onNext} onClick={onNext}>
          Anexo seguinte
        </Button>
      </Stack>
    </>
  );
}

export function DocumentGallery({
  documents,
  actions,
  disabled = false,
}: {
  documents: PreviewDocument[];
  actions?: (document: PreviewDocument, index: number) => ReactNode;
  disabled?: boolean;
}) {
  const scope = useId();
  const [selected, setSelected] = useState<string>();
  const index = documents.findIndex((document) => document.id === selected);
  const current = documents[index];
  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 1.5,
        }}
      >
        {documents.map((document, position) => (
          <Card key={document.id} variant="outlined">
            <CardActionArea
              aria-label={`Ver ${document.filename}`}
              disabled={disabled}
              onClick={() => setSelected(document.id)}
            >
              <Box
                sx={{
                  height: 168,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'action.hover',
                  p: 1,
                  overflow: 'hidden',
                }}
              >
                <DocumentContent document={document} scope={scope} thumbnail />
              </Box>
              <Box sx={{ p: 1 }}>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                  {document.filename}
                </Typography>
                {document.caption && (
                  <Typography variant="caption" color="text.secondary">
                    {document.caption}
                  </Typography>
                )}
                {document.size !== undefined && (
                  <Typography
                    display="block"
                    variant="caption"
                    color="text.secondary"
                  >
                    {(document.size / (1024 * 1024)).toLocaleString('pt-PT', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    MB
                  </Typography>
                )}
              </Box>
            </CardActionArea>
            {actions && (
              <Stack
                direction="row"
                justifyContent="flex-end"
                flexWrap="wrap"
                sx={{ px: 0.5, pb: 0.5 }}
              >
                {actions(document, position)}
              </Stack>
            )}
          </Card>
        ))}
      </Box>
      <Dialog
        fullScreen
        open={!!current}
        onClose={() => setSelected(undefined)}
        aria-labelledby="document-preview-title"
      >
        {current && (
          <FullDocument
            key={current.id}
            document={current}
            scope={scope}
            onClose={() => setSelected(undefined)}
            position={`${index + 1} / ${documents.length}`}
            onPrevious={
              index > 0
                ? () => setSelected(documents[index - 1]!.id)
                : undefined
            }
            onNext={
              index < documents.length - 1
                ? () => setSelected(documents[index + 1]!.id)
                : undefined
            }
          />
        )}
      </Dialog>
    </>
  );
}
