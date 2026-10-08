import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@church/shared';
import { PrismaService } from '../../database/prisma.service';
import { bindAudit, auditRequestFields } from '../audit/audit-context';
import {
  AnonymizeDto,
  ConsentDto,
  PersonalExportQuery,
  PrivacyRequestDto,
  ResolvePrivacyDto,
  RetentionDto,
} from './privacy.dto';
const profile = {
  id: true,
  name: true,
  email: true,
  phone: true,
  birthDate: true,
  status: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  anonymizedAt: true,
} as const;
@Injectable()
export class PrivacyService {
  constructor(private readonly db: PrismaService) {}
  async own(user: CurrentUser) {
    const identity = await this.db.user.findUnique({
      where: { id: user.id },
      select: { memberId: true },
    });
    if (!identity?.memberId)
      throw new NotFoundException('Conta sem vínculo de membro verificado');
    return identity.memberId;
  }
  async me(user: CurrentUser) {
    return this.db.member.findUniqueOrThrow({
      where: { id: await this.own(user) },
      select: profile,
    });
  }
  async export(memberId: string, q: PersonalExportQuery, user: CurrentUser) {
    const financial = q.includeFinancial === 'true';
    if (
      financial &&
      (!user.permissions.includes('FINANCE_CONTRIBUTION_EXPORT') ||
        !user.permissions.includes('FINANCE_CONTRIBUTION_READ'))
    )
      throw new ForbiddenException(
        'Exportação de contribuições exige leitura e permissão específica de exportação',
      );
    return this.db.$transaction(
      async (tx) => {
        await bindAudit(tx);
        const member = await tx.member.findUnique({
          where: { id: memberId },
          select: profile,
        });
        if (!member) throw new NotFoundException();
        const consents = await tx.memberConsent.findMany({
          where: { memberId },
          take: 10001,
          orderBy: { createdAt: 'asc' },
        });
        const requests = await tx.privacyRequest.findMany({
          where: { memberId },
          take: 10001,
          orderBy: { createdAt: 'asc' },
        });
        const loans = await tx.loan.findMany({
          where: { memberId },
          select: {
            id: true,
            status: true,
            borrowedAt: true,
            dueAt: true,
            returnedAt: true,
            bookCopy: {
              select: { id: true, book: { select: { id: true, title: true } } },
            },
            fine: { select: { id: true, amount: true, paidAmount: true } },
          },
          take: 10001,
        });
        const contributions = financial
          ? await tx.contribution.findMany({
              where: { memberId },
              select: {
                id: true,
                type: true,
                createdAt: true,
                income: {
                  select: {
                    id: true,
                    date: true,
                    amount: true,
                    description: true,
                    origin: true,
                    reference: true,
                    status: true,
                    account: { select: { currency: true } },
                    bankTransaction: {
                      select: {
                        id: true,
                        reference: true,
                        import: { select: { id: true, filename: true } },
                      },
                    },
                  },
                },
              },
              take: 10001,
            })
          : [];
        if (
          loans.length > 10000 ||
          contributions.length > 10000 ||
          consents.length > 10000 ||
          requests.length > 10000
        )
          throw new BadRequestException(
            'Volume exige exportação assistida pelo responsável de privacidade',
          );
        await tx.auditLog.create({
          data: {
            ...auditRequestFields(),
            userId: user.id,
            action: 'PRIVACY_EXPORT',
            entity: 'Member',
            entityId: memberId,
            metadata: {
              includeFinancial: financial,
              count:
                1 +
                loans.length +
                contributions.length +
                consents.length +
                requests.length,
            },
          },
        });
        return {
          generatedAt: new Date().toISOString(),
          member,
          consents,
          requests,
          loans,
          ...(financial ? { contributions } : {}),
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 30000,
      },
    );
  }
  async requests(user: CurrentUser) {
    return this.db.privacyRequest.findMany({
      where: { memberId: await this.own(user) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  async request(dto: PrivacyRequestDto, user: CurrentUser) {
    const memberId = await this.own(user);
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      return tx.privacyRequest.create({
        data: { ...dto, memberId, requestedBy: user.id },
      });
    });
  }
  async consent(dto: ConsentDto, user: CurrentUser) {
    const memberId = await this.own(user);
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      return tx.memberConsent.create({
        data: { ...dto, memberId, recordedBy: user.id },
      });
    });
  }
  async resolve(id: string, dto: ResolvePrivacyDto, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      await tx.$queryRaw`SELECT id FROM privacy_requests WHERE id=${id}::uuid FOR UPDATE`;
      const request = await tx.privacyRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException();
      if (request.status !== 'PENDING')
        throw new ConflictException('Solicitação já resolvida');
      if (request.kind === 'ANONYMIZATION' && dto.status === 'COMPLETED')
        throw new ConflictException(
          'Use a operação de anonimização para concluir esta solicitação',
        );
      return tx.privacyRequest.update({
        where: { id },
        data: { ...dto, resolvedBy: user.id, resolvedAt: new Date() },
      });
    });
  }
  policies() {
    return this.db.privacyRetentionPolicy.findMany({
      orderBy: { dataClass: 'asc' },
    });
  }
  async policy(dto: RetentionDto, user: CurrentUser) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      return tx.privacyRetentionPolicy.upsert({
        where: { dataClass: dto.dataClass },
        create: { ...dto, updatedBy: user.id },
        update: { ...dto, updatedBy: user.id },
      });
    });
  }
  async hold(memberId: string, legalHold: boolean) {
    return this.db.$transaction(async (tx) => {
      await bindAudit(tx);
      if (!(await tx.member.findUnique({ where: { id: memberId } })))
        throw new NotFoundException();
      return tx.member.update({
        where: { id: memberId },
        data: { legalHold },
        select: { id: true, legalHold: true },
      });
    });
  }
  async anonymize(memberId: string, dto: AnonymizeDto, user: CurrentUser) {
    return this.db.$transaction(
      async (tx) => {
        await bindAudit(tx);
        await tx.$queryRaw`SELECT id FROM members WHERE id=${memberId}::uuid FOR UPDATE`;
        const member = await tx.member.findUnique({
          where: { id: memberId },
          include: {
            user: { include: { userRoles: { include: { role: true } } } },
          },
        });
        if (!member) throw new NotFoundException();
        if (member.anonymizedAt)
          throw new ConflictException('Membro já anonimizado');
        const request = await tx.privacyRequest.findUnique({
          where: { id: dto.requestId },
        });
        if (
          !request ||
          request.memberId !== memberId ||
          request.kind !== 'ANONYMIZATION' ||
          request.status !== 'PENDING'
        )
          throw new ConflictException(
            'Solicitação pendente de anonimização necessária',
          );
        const policy = await tx.privacyRetentionPolicy.findUnique({
          where: { dataClass: 'MEMBER_PROFILE' },
        });
        if (!policy)
          throw new ConflictException(
            'Configure a política de retenção e sua base antes de anonimizar',
          );
        const retainUntil = new Date(member.updatedAt);
        retainUntil.setUTCMonth(
          retainUntil.getUTCMonth() + policy.minimumMonths,
        );
        if (member.legalHold || retainUntil > new Date())
          throw new ConflictException(
            'Retenção ou bloqueio legal impede anonimização',
          );
        const [income, contribution, bank, loans, fines, reservations] =
          await Promise.all([
            tx.income.count({ where: { memberId } }),
            tx.contribution.count({ where: { memberId } }),
            tx.bankTransaction.count({ where: { memberId } }),
            tx.loan.count({
              where: {
                memberId,
                status: { in: ['ACTIVE', 'OVERDUE', 'LOST'] },
              },
            }),
            tx.fine.count({ where: { loan: { memberId }, status: 'OPEN' } }),
            tx.reservation.count({
              where: { memberId, status: { in: ['WAITING', 'READY'] } },
            }),
          ]);
        if (income || contribution || bank || loans || fines || reservations)
          throw new ConflictException(
            'Histórico financeiro ou obrigações ativas exigem avaliação de retenção; nenhuma origem será eliminada',
          );
        if (member.user?.userRoles.some((r) => r.role.name !== 'MEMBER'))
          throw new ConflictException(
            'Conta administrativa exige tratamento separado',
          );
        if (member.user) {
          await tx.user.update({
            where: { id: member.user.id },
            data: {
              name: 'Usuário anonimizado',
              email: `anonymous-${member.user.id}@invalid.example`,
              status: 'DISABLED',
              memberId: null,
            },
          });
          await tx.refreshToken.updateMany({
            where: { userId: member.user.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.passwordReset.updateMany({
            where: { userId: member.user.id, usedAt: null },
            data: { usedAt: new Date() },
          });
        }
        // Scrub linked operational copies as well as the canonical profile.
        // Historical relationships and immutable audit evidence remain intact.
        const convertedVisitors = await tx.visitor.findMany({
          where: { memberId },
          select: { id: true },
        });
        const visitorIds = convertedVisitors.map((v) => v.id);
        const followUpWhere: Prisma.FollowUpWhereInput = {
          OR: [{ memberId }, { visitorId: { in: visitorIds } }],
        };
        await tx.followUpInteraction.updateMany({
          where: { followUp: followUpWhere },
          data: { notes: 'Registro anonimizado' },
        });
        await tx.followUp.updateMany({
          where: followUpWhere,
          data: { notes: null },
        });
        await tx.volunteerAssignment.updateMany({
          where: { memberId },
          data: { notes: null },
        });
        await tx.notification.updateMany({
          where: {
            OR: [
              { recipientMemberId: memberId },
              { recipientVisitorId: { in: visitorIds } },
            ],
          },
          data: { subject: null, content: 'Mensagem anonimizada', error: null },
        });
        await tx.visitor.updateMany({
          where: { memberId },
          data: {
            name: 'Visitante anonimizado',
            firstName: 'Visitante',
            lastName: 'anonimizado',
            email: null,
            phone: null,
            birthDate: null,
            gender: null,
            howDidYouHear: null,
            notes: null,
            status: 'INACTIVE',
          },
        });
        const result = await tx.member.update({
          where: { id: memberId },
          data: {
            name: `Membro anonimizado ${memberId.slice(0, 8)}`,
            email: null,
            phone: null,
            birthDate: null,
            notes: null,
            status: 'INACTIVE',
            anonymizedAt: new Date(),
          },
        });
        await tx.privacyRequest.update({
          where: { id: request.id },
          data: {
            status: 'COMPLETED',
            resolvedBy: user.id,
            resolvedAt: new Date(),
            resolution:
              'Perfil anonimizado conforme política aprovada; auditoria e registros retidos preservados',
          },
        });
        return { id: result.id, anonymizedAt: result.anonymizedAt };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      },
    );
  }
}
