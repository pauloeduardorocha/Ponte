import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useForm } from 'react-hook-form';
import { LocalizedTextField } from './LocalizedTextField';

describe('Localized dates', () => {
  it('displays day/month/year and sends ISO dates from registered forms, including reset', async () => {
    const save = vi.fn();
    function Form() {
      const form = useForm({ defaultValues: { date: '2026-10-07' } });
      return (
        <form onSubmit={form.handleSubmit(save)}>
          <LocalizedTextField
            label="Data"
            type="date"
            {...form.register('date')}
          />
          <button type="submit">Salvar</button>
          <button
            type="button"
            onClick={() => form.reset({ date: '2026-01-02' })}
          >
            Restaurar
          </button>
        </form>
      );
    }
    render(<Form />);
    const input = screen.getByRole('textbox', { name: 'Data' });
    expect(input).toHaveValue('07/10/2026');
    fireEvent.change(input, { target: { value: '09/11/2026' } });
    fireEvent.click(screen.getByText('Salvar'));
    await vi.waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        { date: '2026-11-09' },
        expect.anything(),
      ),
    );
    fireEvent.change(input, { target: { value: '31/02/2026' } });
    expect(input).toBeInvalid();
    fireEvent.click(screen.getByText('Restaurar'));
    expect(input).toHaveValue('02/01/2026');
    expect(input).toBeValid();
  });

  it('rejects impossible dates and preserves local date/time values', () => {
    const change = vi.fn();
    render(
      <LocalizedTextField
        label="Início"
        type="datetime-local"
        defaultValue="2026-10-07T12:30"
        onChange={change}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Início' });
    expect(input).toHaveValue('07/10/2026 12:30');
    fireEvent.change(input, { target: { value: '31/02/2026 12:30' } });
    expect(input).toBeInvalid();
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '09/11/2026 14:30' } });
    expect(input).toBeValid();
    expect(change.mock.calls[0]![0].target.value).toBe('2026-11-09T14:30');
  });
});
