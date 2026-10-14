import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Chip,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { RecordRow, RecordTable } from './RecordTable';
import { SortableTable } from './SortableTable';

afterEach(cleanup);

const recordNames = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getByRole('rowheader').textContent);

describe('Sortable tables', () => {
  it('sorts text and decimal amounts in both directions and keeps actions attached to their record', () => {
    const edit = vi.fn();
    render(
      <RecordTable primaryLabel="Nome" summaryLabel="Valor">
        {[
          { name: 'Zulu', amount: '10.00' },
          { name: 'Álvaro', amount: '2.50' },
          { name: 'Ana', amount: '2.05' },
        ].map((item) => (
          <RecordRow
            key={item.name}
            primary={item.name}
            summary={`${item.amount} EUR`}
            actions={<Button onClick={() => edit(item.name)}>Editar</Button>}
          >
            Descrição
          </RecordRow>
        ))}
      </RecordTable>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nome' }));
    expect(recordNames()).toEqual(['Álvaro', 'Ana', 'Zulu']);
    expect(
      screen.getByRole('columnheader', { name: 'Nome' }),
    ).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nome' }));
    expect(recordNames()).toEqual(['Zulu', 'Ana', 'Álvaro']);
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Valor' }));
    expect(recordNames()).toEqual(['Ana', 'Álvaro', 'Zulu']);
    fireEvent.click(
      within(screen.getAllByRole('row')[1]!).getByRole('button', {
        name: 'Editar',
      }),
    );
    expect(edit).toHaveBeenCalledWith('Ana');
    expect(
      screen.queryByRole('button', { name: 'Ações' }),
    ).not.toBeInTheDocument();
  });

  it('sorts displayed dates chronologically, retains stable ties and keeps missing values last', () => {
    render(
      <RecordTable primaryLabel="Nome" detailsLabel="Data" hasActions={false}>
        {[
          ['Fevereiro', '01/02/2026'],
          ['Janeiro A', '31/01/2026'],
          ['Sem data', '—'],
          ['Janeiro B', '31/01/2026'],
        ].map(([name, date]) => (
          <RecordRow key={name} primary={name} hasActions={false}>
            {date}
          </RecordRow>
        ))}
      </RecordTable>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Data' }));
    expect(recordNames()).toEqual([
      'Janeiro A',
      'Janeiro B',
      'Fevereiro',
      'Sem data',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Data' }));
    expect(recordNames()).toEqual([
      'Fevereiro',
      'Janeiro A',
      'Janeiro B',
      'Sem data',
    ]);
  });

  it('supports existing table cells, chip labels and loading rows', () => {
    const { rerender } = render(
      <SortableTable nonSortableColumns={[2]}>
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell>Ações</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell colSpan={3}>Carregando</TableCell>
          </TableRow>
        </TableBody>
      </SortableTable>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Estado' }));
    expect(screen.getByText('Carregando')).toBeVisible();
    rerender(
      <SortableTable nonSortableColumns={[2]}>
        <TableHead>
          <TableRow>
            <TableCell>Nome</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell>Ações</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {[
            ['B', 'Pendente'],
            ['A', 'Ativo'],
          ].map(([name, status]) => (
            <TableRow key={name}>
              <TableCell>{name}</TableCell>
              <TableCell>
                <Chip label={status} />
              </TableCell>
              <TableCell>
                <Button>Editar</Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </SortableTable>,
    );
    expect(
      screen
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[0]!.textContent),
    ).toEqual(['A', 'B']);
  });
});
