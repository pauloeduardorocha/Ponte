import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  RenderTask,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

export function PdfPreview({
  blob,
  thumbnail = false,
  zoom = 1,
}: {
  blob: Blob;
  thumbnail?: boolean;
  zoom?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    let disposed = false;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        const pdfjs = await import('pdfjs-dist');
        if (disposed) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        task = pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
        });
        if (disposed) {
          await task.destroy();
          return;
        }
        const loaded = await task.promise;
        if (!disposed) setDocument(loaded);
      } catch {
        if (!disposed)
          setError(
            'Não foi possível visualizar este PDF. Pode descarregá-lo para o abrir.',
          );
      }
    }
    void load();
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [blob]);
  useEffect(() => {
    if (!document || !canvas.current) return;
    let disposed = false;
    let task: RenderTask | undefined;
    setRendering(true);
    async function render() {
      try {
        const pdfPage = await document!.getPage(page);
        if (disposed || !canvas.current) return;
        const natural = pdfPage.getViewport({ scale: 1 });
        const width = thumbnail
          ? 300
          : Math.min(window.innerWidth - 48, 1400) * zoom;
        const viewport = pdfPage.getViewport({ scale: width / natural.width });
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const target = canvas.current;
        target.width = Math.floor(viewport.width * outputScale);
        target.height = Math.floor(viewport.height * outputScale);
        const context = target.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        task = pdfPage.render({
          canvas: target,
          canvasContext: context,
          viewport,
          transform:
            outputScale === 1
              ? undefined
              : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await task.promise;
        if (!disposed) setRendering(false);
      } catch {
        if (!disposed) {
          setRendering(false);
          setError('Não foi possível apresentar esta página.');
        }
      }
    }
    void render();
    return () => {
      disposed = true;
      task?.cancel();
    };
  }, [document, page, thumbnail, zoom]);
  return (
    <Stack spacing={1} alignItems="center" sx={{ width: '100%' }}>
      {error ? (
        <Alert
          severity="warning"
          sx={{ fontSize: thumbnail ? '0.75rem' : undefined }}
        >
          {error}
        </Alert>
      ) : (
        <>
          {rendering && (
            <CircularProgress
              size={thumbnail ? 22 : 32}
              aria-label="A carregar PDF"
            />
          )}
          <Box
            component="canvas"
            ref={canvas}
            role="img"
            aria-label={`Página ${page} do PDF`}
            sx={{
              maxWidth: '100%',
              maxHeight: thumbnail ? 152 : undefined,
              objectFit: 'contain',
              bgcolor: '#fff',
              display: rendering ? 'none' : 'block',
            }}
          />
        </>
      )}
      {!thumbnail && document && document.numPages > 1 && (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button
            disabled={page === 1 || rendering}
            onClick={() => setPage((value) => value - 1)}
          >
            Página anterior
          </Button>
          <Typography>
            {page} / {document.numPages}
          </Typography>
          <Button
            disabled={page === document.numPages || rendering}
            onClick={() => setPage((value) => value + 1)}
          >
            Página seguinte
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
