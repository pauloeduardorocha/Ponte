import { t as translate, getLocale, useLocale } from '../i18n';
import {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  Table,
  TableBody,
  TableHead,
  TableSortLabel,
  type TableProps,
} from '@mui/material';
import { STATUS_LABELS } from '../lib/status-labels';

type ContentProps = {
  children?: ReactNode;
  label?: ReactNode;
  status?: string;
  colSpan?: number;
  primary?: ReactNode;
  summary?: ReactNode;
  'data-sort-value'?: string | number;
};
type ContentElement = ReactElement<ContentProps>;
const collator = () =>
  new Intl.Collator(getLocale(), {
    numeric: true,
    sensitivity: 'base',
  });

function elements(children: ReactNode): ContentElement[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<ContentProps>(child)) return [];
    return child.type === Fragment ? elements(child.props.children) : [child];
  });
}

function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number')
        return String(child);
      if (!isValidElement<ContentProps>(child)) return '';
      const props = child.props;
      if (props['data-sort-value'] !== undefined)
        return String(props['data-sort-value']);
      if (props.label !== undefined) return textOf(props.label);
      if (props.status) return STATUS_LABELS[props.status] ?? props.status;
      return textOf(props.children);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function comparable(value: string): string | number {
  const date = value.match(/^(\d{4}-\d{2}-\d{2})(?:T[\d:.Z+-]+)?(?:\s|$)/);
  if (date) return Date.parse(date[0].trim());
  const localDate = value.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?(?:\s|$)/,
  );
  if (localDate)
    return Date.UTC(
      Number(localDate[3]),
      Number(localDate[2]) - 1,
      Number(localDate[1]),
      Number(localDate[4] ?? 0),
      Number(localDate[5] ?? 0),
      Number(localDate[6] ?? 0),
    );
  const amount = value.match(
    /^(?:(?:[A-Z]{3}|[€$£])\s*)?(-?\d[\d.,\s]*)(?:\s*(?:[A-Z]{3}|[€$£]|KB|empréstimos|loans))?$/,
  );
  if (amount) {
    let number = amount[1]!.replace(/\s/g, '');
    if (getLocale() === 'en') number = number.replace(/,/g, '');
    else if (number.includes(','))
      number = number.replace(/\./g, '').replace(',', '.');
    const parsed = Number(number);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}

function rowValues(row: ContentElement): string[] {
  if ('primary' in row.props)
    return [
      textOf(row.props.primary),
      ...(row.props.summary !== undefined ? [textOf(row.props.summary)] : []),
      textOf(row.props.children),
    ];
  return elements(row.props.children).map((cell) => textOf(cell));
}

/** Sorts loaded rows; server-paginated lists retain their pagination. */
export function SortableTable({
  children,
  nonSortableColumns = [],
  ...props
}: TableProps & { nonSortableColumns?: number[] }) {
  useLocale();
  const [sort, setSort] = useState<{
    column: number;
    direction: 'asc' | 'desc';
  }>();
  const parts = elements(children);
  const head = parts.find((part) => part.type === TableHead);
  const body = parts.find((part) => part.type === TableBody);
  const headers = head
    ? elements(head.props.children).flatMap((row) =>
        elements(row.props.children),
      )
    : [];
  const active =
    sort && !nonSortableColumns.includes(sort.column) && headers[sort.column]
      ? sort
      : undefined;
  const rows = body ? elements(body.props.children) : [];
  const sorted = active
    ? rows
        .map((row, index) => ({
          row,
          index,
          value: rowValues(row)[active.column] ?? '',
        }))
        .sort((a, b) => {
          // Loading and empty-state rows stay in place.
          if (
            elements(a.row.props.children).some((cell) => cell.props.colSpan) ||
            elements(b.row.props.children).some((cell) => cell.props.colSpan)
          )
            return a.index - b.index;
          const emptyA = !a.value || a.value === '—';
          const emptyB = !b.value || b.value === '—';
          if (emptyA !== emptyB) return emptyA ? 1 : -1;
          const av = comparable(a.value),
            bv = comparable(b.value);
          const compared =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : collator().compare(a.value, b.value);
          return compared
            ? compared * (active.direction === 'asc' ? 1 : -1)
            : a.index - b.index;
        })
        .map(({ row }) => row)
    : rows;
  return (
    <Table {...props}>
      {parts.map((part) => {
        if (part === head)
          return cloneElement(
            part,
            {},
            elements(part.props.children).map((row) =>
              cloneElement(
                row,
                {},
                elements(row.props.children).map((cell, column) => {
                  if (nonSortableColumns.includes(column)) return cell;
                  const selected = active?.column === column;
                  return cloneElement(
                    cell as ReactElement<
                      ContentProps & { sortDirection?: 'asc' | 'desc' | false }
                    >,
                    { sortDirection: selected ? active.direction : false },
                    <TableSortLabel
                      aria-label={translate('Ordenar por {0}', [
                        textOf(cell.props.children),
                      ])}
                      active={selected}
                      direction={selected ? active.direction : 'asc'}
                      onClick={() =>
                        setSort({
                          column,
                          direction:
                            selected && active.direction === 'asc'
                              ? 'desc'
                              : 'asc',
                        })
                      }
                      title={translate('Ordenar os registos carregados')}
                    >
                      {cell.props.children}
                    </TableSortLabel>,
                  );
                }),
              ),
            ),
          );
        if (part === body) return cloneElement(part, {}, sorted);
        return part;
      })}
    </Table>
  );
}
