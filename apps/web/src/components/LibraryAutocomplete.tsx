import { useState, type ChangeEvent } from 'react';
import {
  Autocomplete,
  CircularProgress,
  TextField,
  type TextFieldProps,
} from '@mui/material';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Page } from '@church/shared';
import { apiRequest } from '../lib/api';
import { useDebouncedValue } from '../lib/use-debounced-value';

type Option = {
  id: string;
  name?: string;
  title?: string;
  author?: string;
  assetCode?: string;
  book?: { title: string };
};
const optionLabel = (option: Option) =>
  option.assetCode
    ? `${option.book?.title ?? ''} · ${option.assetCode}`
    : option.title
      ? `${option.title} · ${option.author ?? ''}`
      : (option.name ?? 'Registro selecionado');

/** Fetches one bounded page on opening, typing or explicitly scrolling. */
export function LibraryAutocomplete({
  endpoint,
  query = {},
  value,
  onChange,
  excludeId,
  ...props
}: TextFieldProps & {
  endpoint: string;
  query?: Record<string, string>;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Option | null>(null);
  const debounced = useDebouncedValue(search);
  const options = useInfiniteQuery({
    queryKey: ['library', 'autocomplete', endpoint, query, debounced],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiRequest<Page<Option>>(endpoint, {
        query: { ...query, search: debounced, page: pageParam, pageSize: 10 },
      }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: open && !props.disabled && search === debounced,
    staleTime: endpoint.startsWith('/library/copies') ? 0 : 6 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
  const items = (
    search === debounced
      ? (options.data?.pages.flatMap((page) => page.items) ?? [])
      : []
  ).filter((item) => item.id !== excludeId);
  const chosen = value
    ? (items.find((item) => item.id === value) ??
      (selected?.id === value ? selected : { id: String(value) }))
    : null;
  return (
    <Autocomplete
      sx={{ minWidth: 220 }}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      disabled={props.disabled}
      options={items}
      value={chosen}
      getOptionLabel={optionLabel}
      getOptionKey={(option) => option.id}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      filterOptions={(items) => items}
      loading={options.isFetching || search !== debounced}
      loadingText="Carregando opções…"
      noOptionsText={
        options.isError
          ? 'Não foi possível carregar as opções.'
          : 'Nenhum resultado.'
      }
      onInputChange={(_, text, reason) => {
        if (reason === 'input' || reason === 'clear') setSearch(text);
      }}
      onChange={(_, next) => {
        setSelected(next);
        setSearch('');
        onChange?.({
          target: { value: next?.id ?? '' },
        } as ChangeEvent<HTMLInputElement>);
      }}
      slotProps={{
        listbox: {
          onScroll: (event) => {
            const list = event.currentTarget;
            if (
              list.scrollTop + list.clientHeight >= list.scrollHeight - 24 &&
              options.hasNextPage &&
              !options.isFetching &&
              search === debounced
            )
              void options.fetchNextPage();
          },
        },
      }}
      renderInput={(params) => (
        <TextField
          {...props}
          {...params}
          error={props.error || options.isError}
          helperText={options.error?.message ?? props.helperText}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {options.isFetching && <CircularProgress size={16} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
            htmlInput: params.inputProps,
          }}
        />
      )}
    />
  );
}
