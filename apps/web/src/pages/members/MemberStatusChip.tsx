import { t as translate, useLocale } from '../../i18n';
import { Chip } from '@mui/material';
import type { MemberStatus } from '../../lib/types';

export function MemberStatusChip({ status }: { status: MemberStatus }) {
  useLocale();
  return (
    <Chip
      size="small"
      color={status === 'ACTIVE' ? 'success' : 'default'}
      label={status === 'ACTIVE' ? translate('Ativo') : translate('Inativo')}
    />
  );
}
