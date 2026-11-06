import { CommunityController } from './community.controller';
import { PrismaService } from '../../database/prisma.service';
import { OperationsService } from '../operations/operations.service';
describe('Birthday photos', () => {
  it.each(['day', 'week'])(
    'uses the member account photo for %s',
    async (period) => {
      const rows = [
        { id: 'member', name: 'Ana', avatar: 'photo' },
        { id: 'no-photo', name: 'Maria', avatar: null },
      ];
      const query = jest.fn().mockResolvedValue(rows);
      const controller = new CommunityController(
        { $queryRaw: query } as unknown as PrismaService,
        {} as OperationsService,
      );
      expect(await controller.birthdays(period)).toEqual(rows);
      const sql = query.mock.calls[0][0].join('');
      expect(sql).toContain('u.avatar');
      expect(sql).toContain(
        'LEFT JOIN users u ON u.member_id = m.id AND u.deleted_at IS NULL',
      );
      expect(sql).toContain('m.anonymized_at IS NULL');
    },
  );
});
