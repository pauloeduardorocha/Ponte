import { useId, useRef, useState } from 'react';
import {
  Alert,
  Box,
  MenuItem,
  Button,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloudUploadRounded from '@mui/icons-material/CloudUploadRounded';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../auth/auth-context';
import { DocumentGallery } from '../../components/DocumentGallery';
import {
  type Reimbursement,
  prepareReimbursementFiles,
  prepareReimbursementCameraPhoto,
  reimbursementFileRequest,
} from './api';

export function ReimbursementForm({
  initial,
  onSaved,
}: {
  initial?: Reimbursement;
  onSaved: (receipt: { id: string; possibleDuplicate?: boolean }) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: ['reimbursement-profile', user?.id],
    queryFn: () =>
      apiRequest<{ name: string; iban: string | null } | null>(
        '/reimbursements/profile',
      ),
    enabled: Boolean(user),
  });
  const categories = useQuery({
    queryKey: ['reimbursement-categories', user?.id],
    queryFn: () =>
      apiRequest<{ id: string; name: string }[]>('/reimbursements/categories'),
    enabled: Boolean(user),
  });
  const beneficiaryName =
    initial?.beneficiaryName ?? profile.data?.name ?? user?.name ?? '';
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [enteredIban, setIban] = useState<string>();
  const iban = enteredIban ?? initial?.iban ?? profile.data?.iban ?? '';
  const [purpose, setPurpose] = useState(initial?.purpose ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const validAmount =
    /^(?:0|[1-9]\d{0,9})(?:[.,]\d{1,2})?$/.test(amount) &&
    Number(amount.replace(',', '.')) > 0;
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const dropHintId = useId();
  const save = useMutation({
    mutationFn: async ({
      iban,
      categoryId,
      purpose,
      amount,
      files,
    }: {
      iban: string;
      categoryId: string;
      purpose: string;
      amount: string;
      files: File[];
    }) => {
      const values = {
        iban,
        categoryId,
        purpose,
        amount: amount.replace(',', '.'),
      };
      if (initial)
        return apiRequest<{ id: string }>(`/reimbursements/${initial.id}`, {
          method: 'PATCH',
          body: values,
        });
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => body.append(key, value));
      files.forEach((file) => body.append('files', file));
      const response = await reimbursementFileRequest('', body);
      return response.json() as Promise<{
        id: string;
        possibleDuplicate?: boolean;
      }>;
    },
    onSuccess: (receipt) => {
      void queryClient.invalidateQueries({
        queryKey: ['reimbursement-profile', user?.id],
      });
      onSaved(receipt);
    },
  });
  async function addFiles(selected: FileList | null, camera = false) {
    if (save.isPending || preparingRef.current || !selected?.length) return;
    const incoming = Array.from(selected);
    if (files.length + incoming.length > 3) {
      setFileError('Selecione até 3 documentos no envio inicial.');
      return;
    }
    preparingRef.current = true;
    setPreparing(true);
    setFileError('');
    try {
      const ready = camera
        ? await Promise.all(incoming.map(prepareReimbursementCameraPhoto))
        : incoming;
      setFiles(await prepareReimbursementFiles([...files, ...ready]));
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar os documentos.',
      );
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  }
  const busy = save.isPending || preparing;
  return (
    <Stack
      component="form"
      spacing={2}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && validAmount)
          save.mutate({
            iban,
            categoryId,
            purpose,
            amount,
            files,
          });
      }}
    >
      <Typography variant="body2">
        O pedido é registado em seu nome. Indique o valor, o seu IBAN e a
        categoria da despesa para guardar o pedido.
      </Typography>
      {!initial && (
        <>
          <Box
            role="button"
            tabIndex={busy ? -1 : 0}
            aria-label="Carregar documentos"
            aria-describedby={dropHintId}
            aria-disabled={busy}
            onClick={() => {
              if (!busy) fileInput.current?.click();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (!busy) fileInput.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (busy) return;
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? 'none' : 'copy';
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (!dragDepth.current) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              addFiles(event.dataTransfer.files);
            }}
            sx={{
              border: '2px dashed',
              borderColor: dragging ? 'primary.main' : 'divider',
              borderRadius: 2,
              bgcolor: dragging ? 'action.selected' : 'background.default',
              p: { xs: 3, sm: 4 },
              textAlign: 'center',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.6 : 1,
              transition: 'background-color 150ms, border-color 150ms',
              '&:hover, &:focus-visible': {
                borderColor: 'primary.main',
                bgcolor: 'action.hover',
              },
              '&:focus-visible': {
                outline: '2px solid',
                outlineColor: 'primary.main',
                outlineOffset: 3,
              },
            }}
          >
            <CloudUploadRounded color="primary" sx={{ fontSize: 40, mb: 1 }} />
            <Typography fontWeight={600}>
              {dragging
                ? 'Largue os documentos aqui'
                : 'Arraste os documentos para aqui'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              ou clique para escolher os ficheiros
            </Typography>
            <Typography
              id={dropHintId}
              variant="caption"
              color="text.secondary"
            >
              Fotos JPEG/PNG até 10 MB · PDFs até 1 MB · até 3 documentos
            </Typography>
          </Box>
          <input
            ref={fileInput}
            hidden
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png"
            onChange={async (e) => {
              const input = e.currentTarget;
              await addFiles(input.files);
              input.value = '';
            }}
          />
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Button component="label" disabled={busy}>
              Tirar fotografia
              <input
                hidden
                type="file"
                accept="image/jpeg,image/png"
                capture="environment"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  await addFiles(input.files, true);
                  input.value = '';
                }}
              />
            </Button>
          </Stack>
          <Typography variant="caption">
            As fotos tiradas aqui são otimizadas para até 768 KB, sem recortes.
            Outras fotos podem ter até 2 MB após a otimização. Confira se o
            documento continua legível na pré-visualização.
          </Typography>
          {preparing && (
            <Typography role="status">A preparar os documentos…</Typography>
          )}
          <DocumentGallery
            disabled={busy}
            documents={files.map((file, index) => ({
              id: `${file.name}-${index}`,
              filename: file.name,
              file,
              mime: file.type,
              size: file.size,
            }))}
            actions={(document, index) => (
              <Button
                disabled={busy}
                aria-label={`Remover ${document.filename}`}
                onClick={() =>
                  setFiles((previous) => previous.filter((_, i) => i !== index))
                }
              >
                Remover
              </Button>
            )}
          />
        </>
      )}
      <TextField
        label="Quem recebe o reembolso?"
        value={beneficiaryName}
        helperText="Nome preenchido automaticamente pela sua conta. Não pode ser alterado."
        slotProps={{
          input: { readOnly: true },
          htmlInput: { readOnly: true, 'aria-readonly': true },
        }}
        sx={{
          '& .MuiInputBase-root': { bgcolor: 'action.disabledBackground' },
        }}
        disabled={save.isPending}
      />
      <TextField
        required
        label="IBAN do beneficiário"
        value={iban}
        onChange={(e) =>
          setIban(e.target.value.replace(/\s/g, '').toUpperCase())
        }
        slotProps={{
          htmlInput: {
            maxLength: 34,
            pattern: '[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}',
          },
        }}
        disabled={save.isPending}
      />
      <TextField
        select
        required
        label="Categoria da despesa"
        value={categoryId}
        onChange={(event) => setCategoryId(event.target.value)}
        disabled={save.isPending || categories.isPending}
      >
        {categories.data?.map((category) => (
          <MenuItem key={category.id} value={category.id}>
            {category.name}
          </MenuItem>
        ))}
      </TextField>
      {categories.error && (
        <Alert severity="error">{categories.error.message}</Alert>
      )}
      {profile.error && <Alert severity="error">{profile.error.message}</Alert>}
      {profile.isSuccess && !profile.data && (
        <Alert severity="warning">
          O cadastro de reembolsos é exclusivo para membros.
        </Alert>
      )}
      <TextField
        required
        label="Valor total (€)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        slotProps={{
          htmlInput: {
            inputMode: 'decimal',
            pattern: '[0-9]+([.,][0-9]{1,2})?',
          },
        }}
        disabled={save.isPending}
      />
      <TextField
        label="Para que foi esta despesa?"
        multiline
        minRows={2}
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        slotProps={{ htmlInput: { maxLength: 2000 } }}
        disabled={save.isPending}
      />
      {fileError && <Alert severity="error">{fileError}</Alert>}
      {save.error && <Alert severity="error">{save.error.message}</Alert>}
      <Button
        type="submit"
        variant="contained"
        disabled={
          busy ||
          !validAmount ||
          !iban ||
          !categoryId ||
          !profile.data ||
          (!initial && !files.length)
        }
      >
        {save.isPending
          ? 'A guardar…'
          : initial
            ? 'Guardar alterações'
            : 'Guardar pedido'}
      </Button>
    </Stack>
  );
}
