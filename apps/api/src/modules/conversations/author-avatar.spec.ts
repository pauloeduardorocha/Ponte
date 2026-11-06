import { ConversationsController } from './conversations.controller';
import { PrismaService } from '../../database/prisma.service';
import { AuthRequest } from '../auth/auth.guard';
const avatar = 'data:image/jpeg;base64,/9j/2Q==';
describe('Conversation author photos', () => {
  it.each([
    { deletedAt: null, member: null, expected: avatar },
    { deletedAt: new Date(), member: null, expected: null },
    { deletedAt: null, member: { anonymizedAt: new Date() }, expected: null },
  ])(
    'returns photos only for visible identities',
    async ({ deletedAt, member, expected }) => {
      const findMany = jest.fn().mockResolvedValue([
        {
          id: 'topic',
          title: 'Tema',
          body: 'Texto',
          deletedAt: null,
          mentions: [],
          hasImage: false,
          author: { id: 'author', name: 'Ana', avatar, deletedAt, member },
        },
      ]);
      const controller = new ConversationsController({
        conversationPost: { findMany },
      } as unknown as PrismaService);
      const result = await controller.list({
        user: { status: 'ACTIVE' },
      } as AuthRequest);
      expect(result.items[0]?.author.avatar).toBe(expected);
      expect(findMany.mock.calls[0][0].select.author.select.avatar).toBe(true);
    },
  );
});
