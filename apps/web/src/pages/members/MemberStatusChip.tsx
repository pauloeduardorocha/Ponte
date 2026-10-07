import { Chip } from '@mui/material';
import type { MemberStatus } from '../../lib/types';

export function MemberStatusChip({ status }: { status: MemberStatus }) {
  return (
    <Chip
      size="small"
      color={status === 'ACTIVE' ? 'success' : 'default'}
      label={status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
    />
  );
}
