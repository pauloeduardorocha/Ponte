import { TextField, type TextFieldProps } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import type { Page } from '@church/shared';
import { apiRequest } from '../lib/api';

type Entity = {
  id: string;
  kind?: string;
  name?: string;
  title?: string;
  author?: string;
  assetCode?: string;
  description?: string;
  date?: string;
  amount?: string;
  book?: { title: string };
  account?: { currency?: string };
};
function label(entity: Entity) {
  if (entity.assetCode)
    return `${entity.book?.title ?? ''} · ${entity.assetCode}`;
  if (entity.title) return `${entity.title} · ${entity.author ?? ''}`;
  return (
    entity.name ??
    [
      entity.description,
      entity.date?.slice(0, 10),
      entity.amount,
      entity.account?.currency,
    ]
      .filter(Boolean)
      .join(' · ')
  );
}

export function EntitySelect({
  endpoint,
  excludeId,
  kind,
  query = {},
  value,
  onChange,
  helperText,
  error,
  disabled,
  ...props
}: TextFieldProps & {
  endpoint: string;
  excludeId?: string;
  kind?: string;
  query?: Record<string, string>;
}) {
  const options = useQuery({
    queryKey: ['entity-options', endpoint, query],
    queryFn: async () => {
      const items: Entity[] = [];
      let page = 1;
      while (true) {
        const result = await apiRequest<Page<Entity>>(endpoint, {
          query: { ...query, page, pageSize: 100 },
        });
        items.push(...result.items);
        if (!result.items.length || items.length >= result.total) break;
        page++;
      }
      return items;
    },
  });
  return (
    <TextField
      {...props}
      select
      value={value ?? ''}
      onChange={onChange}
      disabled={disabled || options.isPending || options.isError}
      error={error || options.isError}
      helperText={
        options.error?.message ??
        (options.isPending
          ? 'Carregando opções…'
          : options.data?.length === 0
            ? 'Nenhuma entidade disponível.'
            : helperText)
      }
      slotProps={{ ...props.slotProps, select: { native: true } }}
    >
      <option value="">Selecione</option>
      {Boolean(value) && !options.data?.some((item) => item.id === value) && (
        <option value={String(value)}>Registro selecionado</option>
      )}
      {options.data
        ?.filter(
          (item) => item.id !== excludeId && (!kind || item.kind === kind),
        )
        .map((item) => (
          <option key={item.id} value={item.id}>
            {label(item)}
          </option>
        ))}
    </TextField>
  );
}
