import { OperationsService } from './operations.service';
import { PrismaService } from '../../database/prisma.service';
import { CurrentUser } from '@church/shared';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';

describe('Ministry schedules and attachments', () => {
  const user = { id: 'user', permissions: ['COMMUNITY_READ'] } as CurrentUser;
  function setup() {
    const db = {
      $executeRaw: jest.fn(),
      user: { findUnique: jest.fn().mockResolvedValue({ memberId: 'member' }) },
      ministry: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      volunteerSchedule: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'schedule', ministryId: 'ministry' }),
        delete: jest.fn().mockResolvedValue({ id: 'schedule' }),
      },
      volunteerAssignment: { updateMany: jest.fn(), deleteMany: jest.fn() },
      scheduleAttachment: {
        update: jest.fn().mockResolvedValue({ id: 'file' }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'file' }),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((fn) => fn(db));
    return {
      db,
      service: new OperationsService(db as unknown as PrismaService, []),
    };
  }
  it('recognizes all active leadership memberships in management scope', async () => {
    const { service } = setup();
    expect(await service.ministryScope(user)).toEqual({
      OR: [
        { leaderMemberId: 'member' },
        {
          members: {
            some: {
              memberId: 'member',
              active: true,
              leftAt: null,
              role: 'LEADER',
            },
          },
        },
      ],
    });
  });
  it('blocks ministry creation by members', async () => {
    const { service } = setup();
    await expect(
      service.saveMinistry(
        undefined,
        { name: 'Music', leaderMemberId: 'member' },
        user,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks enrollment by members who do not lead the ministry', async () => {
    const { service, db } = setup();
    db.ministry.findFirst
      .mockResolvedValueOnce({ active: true })
      .mockResolvedValueOnce(null);
    await expect(
      service.join('ministry', 'ministry', { memberId: 'other' }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('allows ministry members to list attachments using their membership', async () => {
    const { service, db } = setup();
    await service.attachments('schedule', user);
    const query = db.volunteerSchedule.findFirst.mock.calls[0][0];
    expect(JSON.stringify(query)).toContain('member');
    expect(db.scheduleAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, filename: true, mime: true, size: true },
      }),
    );
  });
  it('rejects files over 5 MB before persistence', async () => {
    const { service, db } = setup();
    const buffer = Buffer.alloc(5 * 1024 * 1024 + 1);
    await expect(
      service.uploadAttachment(
        'schedule',
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.scheduleAttachment.create).not.toHaveBeenCalled();
  });
  it('accepts a PDF at exactly 5 MB', async () => {
    const { service, db } = setup();
    const buffer = Buffer.alloc(5 * 1024 * 1024);
    buffer.write('%PDF-');
    await service.uploadAttachment(
      'schedule',
      {
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      },
      user,
    );
    expect(db.scheduleAttachment.create).toHaveBeenCalled();
  });
  it('rejects spoofed file signatures', async () => {
    const { service } = setup();
    const buffer = Buffer.from('fake pdf');
    await expect(
      service.uploadAttachment(
        'schedule',
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('does not resolve an attachment belonging to another schedule', async () => {
    const { service, db } = setup();
    db.scheduleAttachment.findFirst.mockResolvedValue(null);
    await expect(
      service.attachment('schedule', 'other-file', user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.scheduleAttachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-file', scheduleId: 'schedule' },
    });
  });
  it('removes replacement links before deleting participants and schedule', async () => {
    const { service, db } = setup();
    await service.deleteSchedule('schedule', user);
    expect(db.volunteerAssignment.updateMany).toHaveBeenCalledWith({
      where: { scheduleId: 'schedule' },
      data: { replacedByAssignmentId: null },
    });
    expect(db.volunteerAssignment.deleteMany).toHaveBeenCalled();
    expect(db.volunteerSchedule.delete).toHaveBeenCalled();
  });
  it('denies uploading when the actor cannot manage the schedule', async () => {
    const { service, db } = setup();
    db.volunteerSchedule.findFirst.mockResolvedValue(null);
    const buffer = Buffer.from('%PDF-test');
    await expect(
      service.uploadAttachment(
        'schedule',
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
        user,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.scheduleAttachment.create).not.toHaveBeenCalled();
  });
  it('accepts other file formats as downloads', async () => {
    const { service, db } = setup();
    const buffer = Buffer.from('audio');
    await service.uploadAttachment(
      'schedule',
      {
        originalname: 'song.mp3',
        mimetype: 'audio/mpeg',
        size: buffer.length,
        buffer,
      },
      user,
    );
    expect(db.scheduleAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mime: 'application/octet-stream' }),
      }),
    );
  });
  it('keeps partial uploads hidden and marks them complete only at the expected size', async () => {
    const { service, db } = setup();
    const first = Buffer.alloc(2 * 1024 * 1024);
    first.write('%PDF-');
    await service.uploadAttachment(
      'schedule',
      {
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: first.length,
        buffer: first,
      },
      user,
      5 * 1024 * 1024,
    );
    expect(db.scheduleAttachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          size: 5 * 1024 * 1024,
          uploadComplete: false,
        }),
      }),
    );
    const current = Buffer.alloc(4 * 1024 * 1024);
    db.scheduleAttachment.findFirst.mockResolvedValue({
      id: 'file',
      content: current,
      size: 5 * 1024 * 1024,
      uploadComplete: false,
    });
    const last = Buffer.alloc(1024 * 1024);
    await service.appendAttachment(
      'schedule',
      'file',
      current.length,
      {
        originalname: 'file.pdf',
        mimetype: 'application/pdf',
        size: last.length,
        buffer: last,
      },
      user,
    );
    expect(db.scheduleAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          uploadComplete: true,
          content: expect.any(Uint8Array),
        }),
      }),
    );
  });
  it('rejects overlapping or out-of-order upload parts', async () => {
    const { service, db } = setup();
    db.scheduleAttachment.findFirst.mockResolvedValue({
      id: 'file',
      content: Buffer.alloc(5),
      size: 10,
      uploadComplete: false,
    });
    const buffer = Buffer.alloc(3);
    await expect(
      service.appendAttachment(
        'schedule',
        'file',
        4,
        {
          originalname: 'file.pdf',
          mimetype: 'application/pdf',
          size: buffer.length,
          buffer,
        },
        user,
      ),
    ).rejects.toThrow('Parte fora de ordem');
    expect(db.scheduleAttachment.update).not.toHaveBeenCalled();
  });
});
