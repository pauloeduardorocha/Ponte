import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../auth/auth-context';
import { DocumentGallery } from '../../components/DocumentGallery';
import {
  type Reimbursement,
  prepareReimbursementFile,
  reimbursementFileRequest,
} from './api';

export function ReimbursementDocuments({
  row,
  canWrite = false,
  manager = false,
}: {
  row: Reimbursement;
  canWrite?: boolean;
  manager?: boolean;
}) {
  const client = useQueryClient();
  const upload = useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: string }) => {
      const body = new FormData();
      body.append('file', await prepareReimbursementFile(file));
      body.append('kind', kind);
      await reimbursementFileRequest(`/${row.id}/attachments`, body);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['reimbursements'] }),
  });
  return (
    <Stack spacing={1}>
      {canWrite && (
        <Typography variant="caption">
          Fotos JPEG/PNG até 10 MB, comprimidas para cerca de 2 MB sem recortes.
          PDFs até 1 MB.
        </Typography>
      )}
      <DocumentGallery
        documents={row.attachments.map((file) => ({
          ...file,
          caption:
            file.kind === 'PAYMENT'
              ? 'Comprovativo de transferência bancária'
              : 'Documento da despesa',
          path: `/reimbursements/${row.id}/attachments/${file.id}/download`,
        }))}
      />
      {canWrite && row.attachments.length < 10 && (
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {(manager ? ['DOCUMENT', 'PAYMENT'] : ['DOCUMENT']).map((kind) => (
            <Button component="label" key={kind} disabled={upload.isPending}>
              {kind === 'PAYMENT'
                ? 'Anexar comprovativo de transferência bancária'
                : 'Juntar documento'}
              <input
                type="file"
                hidden
                accept="application/pdf,image/jpeg,image/png"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) upload.mutate({ file, kind });
                  event.target.value = '';
                }}
              />
            </Button>
          ))}
        </Stack>
      )}
      {upload.error && <Alert severity="error">{upload.error.message}</Alert>}
    </Stack>
  );
}

export function MovementReimbursement({
  transactionId,
}: {
  transactionId: string;
}) {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const canLink =
    hasPermission('FINANCE_RECONCILE') &&
    hasPermission('FINANCE_TRANSACTION_READ') &&
    hasPermission('FINANCE_TRANSACTION_UPDATE');
  const result = useQuery({
    queryKey: ['reimbursements', 'movement', transactionId],
    queryFn: () =>
      apiRequest<Reimbursement | null>(
        `/reimbursements/movement/${transactionId}`,
      ),
  });
  const suggestions = useQuery({
    queryKey: ['reimbursements', 'movement', transactionId, 'suggestions'],
    enabled: canLink && result.isSuccess && !result.data,
    queryFn: () =>
      apiRequest<Reimbursement[]>(
        `/reimbursements/movement/${transactionId}/suggestions`,
      ),
  });
  const link = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/reimbursements/${id}/link`, {
        method: 'POST',
        body: { transactionId },
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['reimbursements'] }),
        client.invalidateQueries({ queryKey: ['finance'] }),
      ]);
    },
  });
  if (result.error)
    return <Alert severity="error">{result.error.message}</Alert>;
  if (!result.data)
    return (
      <Stack spacing={1}>
        {!!suggestions.data?.length && (
          <Typography variant="subtitle2">
            Possíveis pedidos de reembolso — confirme o beneficiário
          </Typography>
        )}
        {suggestions.data?.map((row) => (
          <Stack direction="row" gap={1} key={row.id}>
            <Typography sx={{ flex: 1 }}>
              {row.beneficiaryName} · {row.purpose}
            </Typography>
            <Button
              disabled={link.isPending}
              onClick={() => link.mutate(row.id)}
            >
              Associar reembolso
            </Button>
          </Stack>
        ))}
        {(link.error || suggestions.error) && (
          <Alert severity="error">
            {(link.error || suggestions.error)?.message}
          </Alert>
        )}
      </Stack>
    );
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">
        Reembolso de {result.data.beneficiaryName}
      </Typography>
      <Typography>{result.data.purpose}</Typography>
      {result.data.deletedAt && (
        <Typography variant="caption">
          Pedido excluído · documentos do movimento preservados
        </Typography>
      )}
      <ReimbursementDocuments row={result.data} />
      <Button
        component={Link}
        to={`/finance?tab=reimbursements&request=${result.data.id}`}
      >
        Abrir pedido de reembolso
      </Button>
    </Stack>
  );
}
