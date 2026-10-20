import { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';
import { TextField, type TextFieldProps } from '@mui/material';
import type { InputBaseComponentProps } from '@mui/material/InputBase';
import { formatDateOnly } from '../lib/format';

function display(value: unknown) {
  if (!value) return '';
  const [date, time] = String(value).split('T');
  return `${formatDateOnly(date!)}${time ? ` ${time.slice(0, 5)}` : ''}`;
}

function parse(value: string, withTime: boolean) {
  const match = value.match(
    withTime
      ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/
      : /^(\d{2})\/(\d{2})\/(\d{4})$/,
  );
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    date.getDate() !== Number(day) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getFullYear() !== Number(year) ||
    (withTime && (Number(hour) > 23 || Number(minute) > 59))
  )
    return null;
  return `${year}-${month}-${day}${withTime ? `T${hour}:${minute}` : ''}`;
}

// Keep ISO values in forms and requests, independently of the browser's locale.
const LocalizedDateInput = forwardRef<
  HTMLInputElement,
  InputBaseComponentProps
>(function LocalizedDateInput(
  { type, value, defaultValue, onChange, onBlur, ...props },
  ref,
) {
  const canonical = useRef<HTMLInputElement | null>(null);
  const visible = useRef<HTMLInputElement | null>(null);
  const withTime = type === 'datetime-local';
  const attach = useCallback(
    (node: HTMLInputElement | null) => {
      canonical.current = node;
      if (node) {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        )!;
        Object.defineProperty(node, 'value', {
          configurable: true,
          get: () => descriptor.get!.call(node) as string,
          set: (next: string) => {
            descriptor.set!.call(node, next);
            if (visible.current) {
              visible.current.value = display(next);
              visible.current.setCustomValidity('');
            }
          },
        });
        node.focus = (options) => visible.current?.focus(options);
      }
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  useLayoutEffect(() => {
    if (value !== undefined && canonical.current)
      canonical.current.value = String(value ?? '');
  }, [value]);
  return (
    <>
      <input
        ref={attach}
        type="hidden"
        name={props.name}
        defaultValue={defaultValue}
      />
      <input
        {...props}
        ref={visible}
        name={undefined}
        type="text"
        defaultValue={display(value ?? defaultValue)}
        placeholder={withTime ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'}
        maxLength={withTime ? 16 : 10}
        onChange={(event) => {
          const raw = event.target.value;
          const iso = raw ? parse(raw, withTime) : '';
          event.target.setCustomValidity(
            iso === null ? 'Use uma data válida no formato dd/mm/yyyy.' : '',
          );
          if (iso !== null && canonical.current) {
            canonical.current.value = iso;
            onChange?.({
              ...event,
              target: canonical.current,
              currentTarget: canonical.current,
            });
          }
        }}
        onBlur={(event) => {
          if (canonical.current)
            onBlur?.({
              ...event,
              target: canonical.current,
              currentTarget: canonical.current,
            });
        }}
      />
    </>
  );
});

export function LocalizedTextField(props: TextFieldProps) {
  if (props.type !== 'date' && props.type !== 'datetime-local')
    return <TextField {...props} />;
  return (
    <TextField
      {...props}
      slotProps={{
        ...props.slotProps,
        inputLabel: { shrink: true, ...props.slotProps?.inputLabel },
        input: {
          ...props.slotProps?.input,
          inputComponent: LocalizedDateInput,
        },
      }}
    />
  );
}
