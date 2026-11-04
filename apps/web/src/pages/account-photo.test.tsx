import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  makeUser,
  mockApi,
  renderApp,
  resetTestState,
  sessionRoutes,
} from '../test/utils';
import { compressAvatar } from '../lib/avatar';
vi.mock('../lib/avatar', () => ({ compressAvatar: vi.fn() }));
beforeEach(resetTestState);
it('uploads the compressed photo, restores it and removes it', async () => {
  let user = { ...makeUser(), avatar: null as string | null };
  const avatar = 'data:image/jpeg;base64,/9j/2Q==';
  vi.mocked(compressAvatar).mockResolvedValue(avatar);
  const requests = mockApi({
    ...sessionRoutes(user),
    'GET /auth/me': () => ({ body: user }),
    'PATCH /auth/preferences': ({ body }) => {
      user = { ...user, ...(body as { avatar: string | null }) };
      return { body: { avatar: user.avatar } };
    },
  });
  const view = renderApp('/account');
  fireEvent.change(await screen.findByLabelText('Selecionar foto'), {
    target: {
      files: [new File(['source'], 'photo.png', { type: 'image/png' })],
    },
  });
  await screen.findByText('Foto atualizada.');
  expect(requests.find((r) => r.method === 'PATCH')?.body).toEqual({ avatar });
  expect(screen.getByAltText(user.name)).toHaveAttribute('src', avatar);
  view.unmount();
  renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Remover foto' }));
  await screen.findByText('Foto atualizada.');
  expect(user.avatar).toBeNull();
});
it('keeps the photo when saving fails', async () => {
  const user = { ...makeUser(), avatar: 'data:image/jpeg;base64,/9j/2Q==' };
  mockApi({
    ...sessionRoutes(user),
    'PATCH /auth/preferences': () => ({
      status: 400,
      body: { message: 'Falha ao salvar foto.' },
    }),
  });
  renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Remover foto' }));
  await screen.findByText('Falha ao salvar foto.');
  expect(screen.getByAltText(user.name)).toHaveAttribute('src', user.avatar);
});
