import type { Permission } from '../../lib/types';
export type Resource =
  | 'visitors'
  | 'follow-ups'
  | 'small-groups'
  | 'ministries'
  | 'events'
  | 'schedules'
  | 'attendance'
  | 'notifications'
  | 'notification-templates';
export type Field = {
  key: string;
  label: string;
  required?: boolean;
  type?:
    | 'date'
    | 'datetime-local'
    | 'time'
    | 'number'
    | 'email'
    | 'textarea'
    | 'boolean';
  options?: string[];
  lookup?: Resource | 'people' | 'assignees';
};
export type Config = {
  title: string;
  read: Permission;
  create: Permission;
  update: Permission;
  statuses?: string[];
  fields: Field[];
};
const name: Field = { key: 'name', label: 'Nome', required: true };
const notes: Field = { key: 'notes', label: 'Observações', type: 'textarea' };
const member: Field = { key: 'memberId', label: 'Membro', lookup: 'people' };
const visitor: Field = {
  key: 'visitorId',
  label: 'Visitante',
  lookup: 'visitors',
};
const leader: Field = {
  key: 'leaderMemberId',
  label: 'Líder',
  lookup: 'people',
  required: true,
};
const description: Field = {
  key: 'description',
  label: 'Descrição',
  type: 'textarea',
};
const active: Field = { key: 'active', label: 'Ativo', type: 'boolean' };
export const configs: Record<Resource, Config> = {
  visitors: {
    title: 'Visitantes',
    read: 'VISITOR_READ',
    create: 'VISITOR_CREATE',
    update: 'VISITOR_UPDATE',
    statuses: [
      'NEW',
      'CONTACTED',
      'IN_FOLLOW_UP',
      'INTEGRATING',
      'INTEGRATED',
      'INACTIVE',
      'ARCHIVED',
    ],
    fields: [
      { key: 'firstName', label: 'Nome', required: true },
      { key: 'lastName', label: 'Sobrenome' },
      { key: 'email', label: 'E-mail', type: 'email' },
      { key: 'phone', label: 'Telefone' },
      { key: 'birthDate', label: 'Nascimento', type: 'date' },
      {
        key: 'gender',
        label: 'Gênero',
        options: ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'],
      },
      {
        key: 'firstVisitDate',
        label: 'Primeira visita',
        type: 'date',
        required: true,
      },
      { key: 'howDidYouHear', label: 'Como conheceu a igreja?' },
      { key: 'invitedByMemberId', label: 'Convidado por', lookup: 'people' },
      notes,
      {
        key: 'status',
        label: 'Situação',
        options: [
          'NEW',
          'CONTACTED',
          'IN_FOLLOW_UP',
          'INTEGRATING',
          'INTEGRATED',
          'INACTIVE',
          'ARCHIVED',
        ],
      },
    ],
  },
  'follow-ups': {
    title: 'Acompanhamento',
    read: 'FOLLOWUP_READ',
    create: 'FOLLOWUP_CREATE',
    update: 'FOLLOWUP_UPDATE',
    statuses: ['PENDING', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'],
    fields: [
      member,
      visitor,
      {
        key: 'assignedToUserId',
        label: 'Responsável',
        lookup: 'assignees',
        required: true,
      },
      {
        key: 'nextContactAt',
        label: 'Próximo contato',
        type: 'datetime-local',
      },
      notes,
      {
        key: 'status',
        label: 'Situação',
        options: [
          'PENDING',
          'IN_PROGRESS',
          'WAITING',
          'COMPLETED',
          'CANCELLED',
        ],
      },
    ],
  },
  'small-groups': {
    title: 'Grupos familiares',
    read: 'SMALL_GROUP_READ',
    create: 'SMALL_GROUP_MANAGE',
    update: 'SMALL_GROUP_MANAGE',
    fields: [
      name,
      description,
      leader,
      { key: 'coLeaderMemberId', label: 'Co-líder', lookup: 'people' },
      { key: 'hostMemberId', label: 'Anfitrião', lookup: 'people' },
      { key: 'address', label: 'Endereço', required: true },
      {
        key: 'meetingDay',
        label: 'Dia da semana',
        options: ['0', '1', '2', '3', '4', '5', '6'],
        required: true,
      },
      { key: 'meetingTime', label: 'Horário', type: 'time', required: true },
      { key: 'capacity', label: 'Capacidade', type: 'number' },
      active,
    ],
  },
  ministries: {
    title: 'Ministérios',
    read: 'MINISTRY_READ',
    create: 'MINISTRY_MANAGE',
    update: 'MINISTRY_MANAGE',
    fields: [name, description, leader, active],
  },
  events: {
    title: 'Eventos',
    read: 'EVENT_READ',
    create: 'EVENT_MANAGE',
    update: 'EVENT_MANAGE',
    statuses: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
    fields: [
      { key: 'title', label: 'Título', required: true },
      description,
      {
        key: 'type',
        label: 'Tipo',
        options: [
          'SERVICE',
          'CONFERENCE',
          'MEETING',
          'TRAINING',
          'SMALL_GROUP',
          'MINISTRY',
          'SPECIAL',
          'OTHER',
        ],
        required: true,
      },
      { key: 'location', label: 'Local', required: true },
      {
        key: 'startDateTime',
        label: 'Início',
        type: 'datetime-local',
        required: true,
      },
      {
        key: 'endDateTime',
        label: 'Fim',
        type: 'datetime-local',
        required: true,
      },
      { key: 'capacity', label: 'Capacidade', type: 'number' },
      {
        key: 'registrationRequired',
        label: 'Inscrição obrigatória',
        type: 'boolean',
      },
      { key: 'ministryId', label: 'Ministério', lookup: 'ministries' },
      { key: 'smallGroupId', label: 'Grupo familiar', lookup: 'small-groups' },
      active,
      {
        key: 'status',
        label: 'Situação',
        options: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
      },
    ],
  },
  schedules: {
    title: 'Escalas',
    read: 'SCHEDULE_READ',
    create: 'SCHEDULE_MANAGE',
    update: 'SCHEDULE_MANAGE',
    statuses: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'eventId', label: 'Evento', lookup: 'events', required: true },
      { key: 'ministryId', label: 'Ministério', lookup: 'ministries' },
      {
        key: 'date',
        label: 'Data e hora',
        type: 'datetime-local',
        required: true,
      },
      notes,
      {
        key: 'status',
        label: 'Situação',
        options: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
      },
    ],
  },
  attendance: {
    title: 'Presenças',
    read: 'ATTENDANCE_READ',
    create: 'ATTENDANCE_MANAGE',
    update: 'ATTENDANCE_MANAGE',
    statuses: ['PRESENT', 'ABSENT', 'EXCUSED'],
    fields: [
      member,
      visitor,
      { key: 'eventId', label: 'Evento', lookup: 'events' },
      { key: 'smallGroupId', label: 'Grupo familiar', lookup: 'small-groups' },
      { key: 'attendanceDate', label: 'Data', type: 'date', required: true },
      {
        key: 'status',
        label: 'Presença',
        options: ['PRESENT', 'ABSENT', 'EXCUSED'],
        required: true,
      },
    ],
  },
  notifications: {
    title: 'Notificações',
    read: 'NOTIFICATION_READ',
    create: 'NOTIFICATION_SEND',
    update: 'NOTIFICATION_SEND',
    statuses: ['PENDING', 'SENT', 'FAILED', 'CANCELLED'],
    fields: [
      { ...member, key: 'recipientMemberId', label: 'Destinatário: membro' },
      {
        ...visitor,
        key: 'recipientVisitorId',
        label: 'Destinatário: visitante',
      },
      {
        key: 'channel',
        label: 'Canal',
        options: ['INTERNAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'],
        required: true,
      },
      { key: 'subject', label: 'Assunto' },
      { key: 'content', label: 'Mensagem', type: 'textarea', required: true },
      { key: 'scheduledAt', label: 'Agendamento', type: 'datetime-local' },
    ],
  },
  'notification-templates': {
    title: 'Modelos de mensagem',
    read: 'NOTIFICATION_READ',
    create: 'NOTIFICATION_SEND',
    update: 'NOTIFICATION_SEND',
    fields: [
      name,
      {
        key: 'channel',
        label: 'Canal',
        options: ['INTERNAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'],
        required: true,
      },
      { key: 'subject', label: 'Assunto' },
      { key: 'content', label: 'Mensagem', type: 'textarea', required: true },
      active,
    ],
  },
};
export const operationLabels: Record<string, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  IN_FOLLOW_UP: 'Em acompanhamento',
  INTEGRATING: 'Em integração',
  INTEGRATED: 'Integrado',
  INACTIVE: 'Inativo',
  ARCHIVED: 'Arquivado',
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  WAITING: 'Aguardando',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
  DRAFT: 'Rascunho',
  PUBLISHED: 'Publicado',
  PRESENT: 'Presente',
  ABSENT: 'Ausente',
  EXCUSED: 'Justificado',
  REGISTERED: 'Inscrito',
  INVITED: 'Convidado',
  CONFIRMED: 'Confirmado',
  DECLINED: 'Recusado',
  REPLACED: 'Substituído',
  SENT: 'Enviado',
  FAILED: 'Falhou',
  SCHEDULED: 'Agendado',
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  IN_PERSON: 'Presencial',
  OTHER: 'Outro',
  INTERNAL: 'Interno',
  SMS: 'SMS',
  PUSH: 'Push',
  LEADER: 'Líder',
  CO_LEADER: 'Co-líder',
  HOST: 'Anfitrião',
  MEMBER: 'Participante',
  SERVICE: 'Culto',
  CONFERENCE: 'Conferência',
  MEETING: 'Reunião',
  TRAINING: 'Formação',
  SMALL_GROUP: 'Grupo familiar',
  MINISTRY: 'Ministério',
  SPECIAL: 'Especial',
  FEMALE: 'Feminino',
  MALE: 'Masculino',
  UNDISCLOSED: 'Não informado',
};
export const dayLabels = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
export type Entry = { id: string; [key: string]: unknown };
export const entryName = (e: Entry) =>
  String(
    e.name ??
      e.title ??
      e.subject ??
      (e.member as Entry | undefined)?.name ??
      (e.visitor as Entry | undefined)?.name ??
      (e.recipientMember as Entry | undefined)?.name ??
      (e.recipientVisitor as Entry | undefined)?.name ??
      e.function ??
      e.type ??
      'Registro',
  );
