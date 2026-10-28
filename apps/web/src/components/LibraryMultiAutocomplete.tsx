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

type Option = { id: string; name?: string };

/** A lazy, paginated multi-select for library options, with optional free text. */
export function LibraryMultiAutocomplete({
  endpoint,
  value,
  onChange,
  freeSolo = false,
  ...props
}: TextFieldProps & {
  endpoint: string;
  freeSolo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const options = useInfiniteQuery({
    queryKey: ['library', 'autocomplete', endpoint, debounced],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiRequest<Page<Option>>(endpoint, {
        query: { search: debounced, page: pageParam, pageSize: 10 },
      }),
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: open && !props.disabled && search === debounced,
    staleTime: endpoint.startsWith('/library/copies') ? 0 : 6 * 60 * 60_000,
    refetchOnWindowFocus: false,
  });
  const items =
    search === debounced
      ? (options.data?.pages.flatMap((page) => page.items) ?? [])
      : [];
  const selectedIds = String(value ?? '')
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const selected = selectedIds.map(
    (id) => items.find((item) => item.id === id) ?? { id, name: id },
  );

  return (
    <Autocomplete<Option, true, false, boolean>
      multiple
      freeSolo={freeSolo}
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      disabled={props.disabled}
      options={items}
      value={selected}
      getOptionLabel={(option) =>
        typeof option === 'string' ? option : (option.name ?? option.id)
      }
      getOptionKey={(option) =>
        typeof option === 'string' ? option : option.id
      }
      isOptionEqualToValue={(option, current) =>
        typeof current === 'string'
          ? option.id === current
          : option.id === current.id
      }
      filterOptions={(available, params) => {
        if (!freeSolo) return available;
        const input = params.inputValue.trim();
        if (
          input &&
          !available.some(
            (option) => option.id.toLocaleLowerCase() === input.toLocaleLowerCase(),
          )
        )
          return [...available, { id: input, name: `Adicionar “${input}”` }];
        return available;
      }}
      loading={options.isFetching || search !== debounced}
      loadingText="Carregando opções…"
      noOptionsText={
        options.isError
          ? 'Não foi possível carregar as opções.'
          : freeSolo && search.trim()
            ? `Adicionar “${search.trim()}”`
            : 'Nenhum resultado.'
      }
      onInputChange={(_, text, reason) => {
        if (reason !== 'blur') setSearch(text);
      }}
      onChange={(_, next) => {
        const ids = next
          .map((item) => (typeof item === 'string' ? item : item.id))
          .map((item) => item.trim())
          .filter(Boolean);
        onChange?.({
          target: { value: [...new Set(ids)].join('\n') },
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
