import { BirthdayPushService } from './birthday-push.service';

describe('Daily birthday push', () => {
  function setup(
    birthdays: { id: string; name: string }[] | null = [
      { id: 'm1', name: 'Maria' },
    ],
  ) {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce(birthdays === null ? [] : [{ day: new Date() }])
        .mockResolvedValueOnce(birthdays),
    };
    const db = {
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'u1', memberId: 'm1' },
          { id: 'u2', memberId: null },
        ]),
      },
    };
    const push = {
      settings: jest.fn().mockReturnValue({ enabled: true }),
      notifyUsers: jest.fn().mockResolvedValue(undefined),
    };
    return {
      db,
      tx,
      push,
      service: new BirthdayPushService(db as never, push as never),
    };
  }
  it('sends personal greetings to celebrants and names to other eligible users', async () => {
    const { service, db, push } = setup();
    await service.deliver();
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', deletedAt: null, pushBirthdays: true },
      }),
    );
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['u1'],
      'pushBirthdays',
      'Feliz aniversário!',
      'Feliz aniversário! Deus abençoe seu dia! ',
      '/',
    );
    expect(push.notifyUsers).toHaveBeenCalledWith(
      ['u2'],
      'pushBirthdays',
      'Aniversariantes do dia',
      'Hoje celebramos: Maria.',
      '/',
    );
  });
  it('does not send before 9h or after the day was claimed', async () => {
    const { service, db, push } = setup(null);
    await service.deliver();
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(push.notifyUsers).not.toHaveBeenCalled();
  });
  it('does not send when there are no birthdays', async () => {
    const { service, push } = setup([]);
    await service.deliver();
    expect(push.notifyUsers).not.toHaveBeenCalled();
  });
  it('does not claim the day when push is unconfigured', async () => {
    const { service, db, push } = setup();
    push.settings.mockReturnValue({ enabled: false });
    await service.deliver();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
