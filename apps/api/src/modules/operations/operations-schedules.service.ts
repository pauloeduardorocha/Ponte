import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { CurrentUser } from '@church/shared';
import { Prisma } from '@prisma/client';
import * as D from './operations.dto';
import type { PrivateUpload } from '../finance/storage.service';
import { OperationsContext } from './operations-context';
import { OperationsEventsService } from './operations-events.service';
import { ScheduleConflictsService } from './schedule-conflicts.service';
import {
  operationalMemberSelect,
  scheduleInclude,
} from './operations.projections';
export class OperationsSchedulesService {
  constructor(
    private readonly context: OperationsContext,
    private readonly eventsService: OperationsEventsService,
    private readonly conflictsService: ScheduleConflictsService,
  ) {}
  private get db() {
    return this.context.db;
  }

  async schedules(q: D.OperationQuery, user: CurrentUser) {
    const where: Prisma.VolunteerScheduleWhereInput = {
      AND: [
        await this.context.scheduleScope(user),
        {
          status: q.status,
          eventId: q.eventId,
          ministryId: q.ministryId,
          date: this.context.range(q),
          ...(q.memberId
            ? { assignments: { some: { memberId: q.memberId } } }
            : {}),
          title: q.search
            ? { contains: q.search, mode: 'insensitive' }
            : undefined,
        },
      ],
    };
    const [items, total] = await this.db.$transaction([
      this.db.volunteerSchedule.findMany({
        where,
        include: scheduleInclude,
        ...this.context.pagination(q),
        orderBy: [{ date: 'desc' }, { id: 'asc' }],
      }),
      this.db.volunteerSchedule.count({ where }),
    ]);
    const ministryScope = await this.context.ministryScope(user);
    const managed = await this.db.ministry.findMany({
      where: {
        AND: [
          ministryScope,
          {
            id: {
              in: items.flatMap((item) =>
                item.ministryId ? [item.ministryId] : [],
              ),
            },
          },
        ],
      },
      select: { id: true },
    });
    const ids = new Set(managed.map((m) => m.id));
    const canCreate =
      (await this.db.ministry.count({ where: ministryScope })) > 0;
    return {
      ...this.context.page(
        items.map((item) => ({
          ...item,
          canManage:
            this.context.all(user) ||
            (item.ministryId
              ? ids.has(item.ministryId)
              : user.permissions.includes('SCHEDULE_MANAGE')),
        })),
        total,
        q,
      ),
      canCreate,
    };
  }
  async schedule(id: string, user: CurrentUser, manage = false) {
    const scope =
      manage && !this.context.all(user)
        ? {
            ministry: await this.context.ministryScope(user),
          }
        : await this.context.scheduleScope(user);
    const s = await this.db.volunteerSchedule.findFirst({
      where: { AND: [{ id }, scope] },
      include: scheduleInclude,
    });
    if (!s) throw new NotFoundException();
    return s;
  }
  async saveSchedule(
    id: string | undefined,
    dto: D.ScheduleDto | D.SchedulePatch,
    user: CurrentUser,
  ) {
    if ((!id && !dto.ministryId) || dto.ministryId === null)
      throw new BadRequestException('Selecione um ministério.');
    if (id) {
      const current = await this.schedule(id, user, true);
      if (!current.ministryId && !dto.ministryId)
        throw new BadRequestException('Selecione um ministério.');
    }
    if (dto.eventId) await this.eventsService.event(dto.eventId, user);
    if (dto.ministryId)
      await this.context.canManageMinistry(dto.ministryId, user);
    return this.context.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const { date, ...rest } = dto;
      const saved = await (id
        ? tx.volunteerSchedule.update({
            where: { id },
            data: { ...rest, date: date ? new Date(date) : undefined },
          })
        : tx.volunteerSchedule.create({
            data: { ...(dto as D.ScheduleDto), date: new Date(date!) },
          }));
      if (
        id &&
        (await this.conflictsService.conflictCount(
          tx,
          undefined,
          undefined,
          id,
        ))
      )
        throw new ConflictException(
          'Alteração cria conflito entre voluntários escalados.',
        );
      return saved;
    });
  }
  async deleteSchedule(id: string, user: CurrentUser) {
    await this.schedule(id, user, true);
    return this.context.write(async (tx) => {
      await tx.volunteerAssignment.updateMany({
        where: { scheduleId: id },
        data: { replacedByAssignmentId: null },
      });
      await tx.volunteerAssignment.deleteMany({ where: { scheduleId: id } });
      return tx.volunteerSchedule.delete({ where: { id } });
    });
  }
  async attachments(id: string, user: CurrentUser) {
    await this.schedule(id, user);
    return this.db.scheduleAttachment.findMany({
      where: { scheduleId: id, uploadComplete: true },
      select: { id: true, filename: true, mime: true, size: true },
      orderBy: { createdAt: 'asc' },
    });
  }
  async uploadAttachment(
    id: string,
    file: PrivateUpload,
    user: CurrentUser,
    totalSize?: number,
  ) {
    await this.schedule(id, user, true);
    if (!file || file.size > 5 * 1024 * 1024)
      throw new BadRequestException('O arquivo deve ter até 5 MB.');
    if (
      !file.buffer ||
      file.size !== file.buffer.length ||
      file.size < 1 ||
      !file.originalname ||
      file.originalname.length > 255 ||
      /[\\/:]/.test(file.originalname) ||
      [...file.originalname].some(
        (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
      )
    )
      throw new BadRequestException('Arquivo ou nome inválido.');
    if (
      totalSize !== undefined &&
      (!Number.isSafeInteger(totalSize) ||
        totalSize < file.size ||
        totalSize > 5 * 1024 * 1024)
    )
      throw new BadRequestException('Tamanho total inv\u00e1lido.');
    const signatures: Record<string, boolean> = {
      'application/pdf': file.buffer.subarray(0, 5).toString() === '%PDF-',
      'image/jpeg': file.buffer
        .subarray(0, 3)
        .equals(Buffer.from([255, 216, 255])),
      'image/png': file.buffer
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    };
    if (Object.hasOwn(signatures, file.mimetype) && !signatures[file.mimetype])
      throw new BadRequestException('Assinatura do arquivo inválida.');
    const mime = Object.hasOwn(signatures, file.mimetype)
      ? file.mimetype
      : 'application/octet-stream';
    return this.context.write((tx) =>
      tx.scheduleAttachment.create({
        data: {
          scheduleId: id,
          filename: file.originalname,
          mime,
          size: totalSize ?? file.size,
          uploadComplete: totalSize === undefined || file.size === totalSize,
          content: new Uint8Array(file.buffer),
        },
        select: { id: true, filename: true, mime: true, size: true },
      }),
    );
  }
  async appendAttachment(
    id: string,
    attachmentId: string,
    offset: number,
    file: PrivateUpload,
    user: CurrentUser,
  ) {
    await this.schedule(id, user, true);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 1 ||
      !file?.buffer ||
      file.size < 1 ||
      file.size > 2 * 1024 * 1024 ||
      file.size !== file.buffer.length
    )
      throw new BadRequestException('Parte inv\u00e1lida.');
    return this.context.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${attachmentId},0))`;
      const current = await tx.scheduleAttachment.findFirst({
        where: { id: attachmentId, scheduleId: id, uploadComplete: false },
      });
      if (!current) throw new NotFoundException();
      if (
        current.content.length !== offset ||
        offset + file.size > current.size
      )
        throw new ConflictException('Parte fora de ordem ou tamanho excedido.');
      const content = Buffer.concat([
        Buffer.from(current.content),
        file.buffer,
      ]);
      return tx.scheduleAttachment.update({
        where: { id: attachmentId },
        data: {
          content: new Uint8Array(content),
          uploadComplete: content.length === current.size,
        },
        select: { id: true, filename: true, mime: true, size: true },
      });
    });
  }
  async attachment(
    id: string,
    attachmentId: string,
    user: CurrentUser,
    remove = false,
  ) {
    await this.schedule(id, user, remove);
    const file = await this.db.scheduleAttachment.findFirst({
      where: { id: attachmentId, scheduleId: id },
    });
    if (!file || (!remove && !file.uploadComplete))
      throw new NotFoundException();
    if (remove) {
      await this.context.write((tx) =>
        tx.scheduleAttachment.delete({ where: { id: attachmentId } }),
      );
      return null;
    }
    return file;
  }
  async assignments(id: string, q: D.OperationQuery, user: CurrentUser) {
    await this.schedule(id, user);
    const where = { scheduleId: id, status: q.status };
    const [items, total] = await this.db.$transaction([
      this.db.volunteerAssignment.findMany({
        where,
        include: { member: { select: operationalMemberSelect } },
        ...this.context.pagination(q),
        orderBy: { id: 'asc' },
      }),
      this.db.volunteerAssignment.count({ where }),
    ]);
    return this.context.page(items, total, q);
  }
  async addAssignment(
    id: string,
    dto: D.AssignmentDto,
    user: CurrentUser,
    replacesId?: string,
  ) {
    const schedule = await this.schedule(id, user, true);
    if (['CANCELLED', 'COMPLETED'].includes(schedule.status))
      throw new ConflictException('Escala encerrada.');
    if (dto.ministryId)
      await this.context.canManageMinistry(dto.ministryId, user);
    return this.context.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      if (schedule.ministryId) await this.context.validMember(tx, dto.memberId);
      else
        await this.context.accessiblePerson(
          tx,
          { memberId: dto.memberId },
          user,
        );
      if (
        schedule.ministryId &&
        !(await tx.ministryMember.findFirst({
          where: {
            ministryId: schedule.ministryId,
            memberId: dto.memberId,
            active: true,
            leftAt: null,
          },
        })) &&
        !(await tx.ministry.findFirst({
          where: { id: schedule.ministryId, leaderMemberId: dto.memberId },
        }))
      )
        throw new BadRequestException('Selecione um membro deste ministério.');
      if (
        await tx.volunteerAssignment.findFirst({
          where: {
            scheduleId: id,
            memberId: dto.memberId,
            status: { in: ['INVITED', 'CONFIRMED'] },
            ...(replacesId ? { id: { not: replacesId } } : {}),
          },
        })
      )
        throw new ConflictException('Membro já escalado.');
      const conflicts = await this.conflictsService.assignmentConflicts(
        tx,
        dto.memberId,
        id,
      );
      if (conflicts.length)
        throw new ConflictException({
          message:
            'Conflito de horário: escolha outro voluntário ou ajuste o evento.',
          ...(this.context.all(user) ? { conflicts } : {}),
        });
      if (replacesId) {
        const old = await tx.volunteerAssignment.findFirst({
          where: {
            id: replacesId,
            scheduleId: id,
            status: { in: ['INVITED', 'CONFIRMED', 'DECLINED', 'ABSENT'] },
          },
        });
        if (!old) throw new NotFoundException();
        await tx.volunteerAssignment.update({
          where: { id: old.id },
          data: { status: 'REPLACED' },
        });
      }
      const row = await tx.volunteerAssignment.create({
        data: { scheduleId: id, ...dto },
      });
      if (replacesId)
        await tx.volunteerAssignment.update({
          where: { id: replacesId },
          data: { replacedByAssignmentId: row.id },
        });
      return row;
    });
  }
  async identity(user: CurrentUser) {
    return {
      memberId:
        (
          await this.db.user.findUnique({
            where: { id: user.id },
            select: { memberId: true },
          })
        )?.memberId ?? null,
    };
  }
  async respond(
    id: string,
    assignmentId: string,
    dto: D.AssignmentResponseDto,
    user: CurrentUser,
  ) {
    await this.schedule(id, user);
    return this.context.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const row = await tx.volunteerAssignment.findFirst({
        where: {
          id: assignmentId,
          scheduleId: id,
          memberId: await this.context.memberId(user),
        },
        include: { schedule: { select: { status: true } } },
      });
      if (!row) throw new NotFoundException();
      if (
        ['CANCELLED', 'COMPLETED'].includes(row.schedule.status) ||
        !['INVITED', 'CONFIRMED', 'DECLINED'].includes(row.status)
      )
        throw new ConflictException('Convocação encerrada.');
      if (
        dto.status === 'CONFIRMED' &&
        (await this.conflictsService.assignmentConflicts(tx, row.memberId, id))
          .length
      )
        throw new ConflictException('Conflito de horário.');
      return tx.volunteerAssignment.update({
        where: { id: assignmentId },
        data: {
          status: dto.status,
          confirmedAt: dto.status === 'CONFIRMED' ? new Date() : null,
        },
      });
    });
  }
  async assignmentStatus(
    id: string,
    assignmentId: string,
    dto: D.AssignmentStatusDto,
    user: CurrentUser,
  ) {
    await this.schedule(id, user, true);
    return this.context.write(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(19009002)`;
      const row = await tx.volunteerAssignment.findFirst({
        where: { id: assignmentId, scheduleId: id },
      });
      if (!row) throw new NotFoundException();
      if (row.status === 'REPLACED')
        throw new ConflictException('Voluntário substituído.');
      if (
        dto.status === 'CONFIRMED' &&
        (await this.conflictsService.assignmentConflicts(tx, row.memberId, id))
          .length
      )
        throw new ConflictException('Conflito de horário.');
      return tx.volunteerAssignment.update({
        where: { id: assignmentId },
        data: {
          status: dto.status,
          confirmedAt:
            dto.status === 'CONFIRMED' ? new Date() : row.confirmedAt,
        },
      });
    });
  }
}
