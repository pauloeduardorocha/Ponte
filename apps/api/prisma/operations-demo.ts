import type { Prisma } from '@prisma/client';
const id = (n: number) =>
  `e9000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export async function seedOperations(tx: Prisma.TransactionClient) {
  const admin = await tx.user.findUniqueOrThrow({
    where: { email: 'admin@ponte.example' },
  });
  const leader = 'a0b00000-0000-4000-8000-000000000001';
  const member = 'a0b00000-0000-4000-8000-000000000002';
  const visitor = await tx.visitor.findUniqueOrThrow({
    where: { id: 'd0000001-0000-4000-8000-000000000001' },
  });
  const event = await tx.communityEvent.findUniqueOrThrow({
    where: { id: 'd0000002-0000-4000-8000-000000000001' },
  });
  await tx.smallGroup.upsert({
    where: { id: id(1) },
    create: {
      id: id(1),
      name: 'Grupo familiar Esperança',
      leaderMemberId: leader,
      hostMemberId: member,
      address: 'Sala da comunidade',
      meetingDay: 3,
      meetingTime: '20:00',
      capacity: 15,
    },
    update: {},
  });
  await tx.smallGroupMember.upsert({
    where: { id: id(2) },
    create: {
      id: id(2),
      smallGroupId: id(1),
      memberId: leader,
      role: 'LEADER',
    },
    update: {},
  });
  await tx.smallGroupMember.upsert({
    where: { id: id(3) },
    create: { id: id(3), smallGroupId: id(1), memberId: member },
    update: {},
  });
  await tx.ministry.upsert({
    where: { id: id(4) },
    create: {
      id: id(4),
      name: 'Recepção',
      description: 'Acolhimento da comunidade',
      leaderMemberId: leader,
    },
    update: {},
  });
  await tx.ministryMember.upsert({
    where: { id: id(5) },
    create: { id: id(5), ministryId: id(4), memberId: leader, role: 'LEADER' },
    update: {},
  });
  await tx.ministryMember.upsert({
    where: { id: id(6) },
    create: { id: id(6), ministryId: id(4), memberId: member },
    update: {},
  });
  await tx.followUp.upsert({
    where: { id: id(7) },
    create: {
      id: id(7),
      visitorId: visitor.id,
      assignedToUserId: admin.id,
      status: 'IN_PROGRESS',
      nextContactAt: new Date(Date.now() + 86400000),
      notes: 'Acolhimento demonstrativo',
    },
    update: {},
  });
  await tx.followUpInteraction.upsert({
    where: { id: id(8) },
    create: {
      id: id(8),
      followUpId: id(7),
      type: 'IN_PERSON',
      interactionDate: visitor.visitedAt,
      performedByUserId: admin.id,
      notes: 'Recebido na primeira visita',
    },
    update: {},
  });
  await tx.volunteerSchedule.upsert({
    where: { id: id(9) },
    create: {
      id: id(9),
      eventId: event.id,
      ministryId: id(4),
      title: 'Recepção do encontro',
      date: event.startsAt,
      status: 'PUBLISHED',
    },
    update: {},
  });
  await tx.volunteerAssignment.upsert({
    where: { id: id(10) },
    create: {
      id: id(10),
      scheduleId: id(9),
      memberId: member,
      ministryId: id(4),
      function: 'Acolhimento',
      status: 'CONFIRMED',
      confirmedAt: new Date(),
    },
    update: {},
  });
  await tx.attendance.upsert({
    where: { id: id(11) },
    create: {
      id: id(11),
      visitorId: visitor.id,
      attendanceDate: visitor.visitedAt,
      status: 'PRESENT',
      source: 'MANUAL',
      registeredByUserId: admin.id,
    },
    update: {},
  });
  await tx.notificationTemplate.upsert({
    where: { name: 'Boas-vindas' },
    create: {
      id: id(12),
      name: 'Boas-vindas',
      channel: 'INTERNAL',
      subject: 'Bem-vindo à comunidade',
      content: 'Estamos felizes com sua visita.',
    },
    update: {},
  });
  await tx.notification.upsert({
    where: { id: id(13) },
    create: {
      id: id(13),
      recipientVisitorId: visitor.id,
      createdByUserId: admin.id,
      channel: 'INTERNAL',
      subject: 'Boas-vindas',
      content: 'Estamos felizes com sua visita.',
    },
    update: {},
  });
}
