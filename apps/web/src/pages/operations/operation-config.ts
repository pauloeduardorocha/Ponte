import { t as translate, localized } from '../../i18n';
import type { Permission } from '../../lib/types';
export type Resource =
  | 'visitors'
  | 'follow-ups'
  | 'small-groups'
  | 'ministries'
  | 'events'
  | 'schedules'
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
  optionLabels?: Record<string, string>;
  multiple?: boolean;
  managedOnly?: boolean;
  lookup?:
    | Resource
    | 'people'
    | 'assignees'
    | 'notification-audiences/small-groups'
    | 'notification-audiences/ministries'
    | 'notification-audiences/roles';
};
export type Config = {
  title: string;
  read: Permission;
  create: Permission;
  update: Permission;
  statuses?: string[];
  fields: Field[];
};
const name: Field = {
  key: 'name',
  get label() {
    return translate('Nome');
  },
  required: true,
};
const notes: Field = {
  key: 'notes',
  get label() {
    return translate('Observações');
  },
  type: 'textarea',
};
const member: Field = {
  key: 'memberId',
  get label() {
    return translate('Membro');
  },
  lookup: 'people',
};
const visitor: Field = {
  key: 'visitorId',
  get label() {
    return translate('Visitante');
  },
  lookup: 'visitors',
};
const leader: Field = {
  key: 'leaderMemberId',
  get label() {
    return translate('Líder');
  },
  lookup: 'people',
  required: true,
};
const description: Field = {
  key: 'description',
  get label() {
    return translate('Descrição');
  },
  type: 'textarea',
};
const active: Field = {
  key: 'active',
  get label() {
    return translate('Ativo');
  },
  type: 'boolean',
};
export const configs: Record<Resource, Config> = {
  visitors: {
    get title() {
      return translate('Visitantes');
    },
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
      {
        key: 'firstName',
        get label() {
          return translate('Nome');
        },
        required: true,
      },
      {
        key: 'lastName',
        get label() {
          return translate('Sobrenome');
        },
      },
      { key: 'email', label: 'E-mail', type: 'email' },
      {
        key: 'phone',
        get label() {
          return translate('Telefone');
        },
      },
      {
        key: 'birthDate',
        get label() {
          return translate('Nascimento');
        },
        type: 'date',
      },
      {
        key: 'gender',
        get label() {
          return translate('Gênero');
        },
        options: ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'],
      },
      {
        key: 'firstVisitDate',
        get label() {
          return translate('Primeira visita');
        },
        type: 'date',
        required: true,
      },
      {
        key: 'howDidYouHear',
        get label() {
          return translate('Como conheceu a igreja?');
        },
      },
      {
        key: 'invitedByMemberId',
        get label() {
          return translate('Convidado por');
        },
        lookup: 'people',
      },
      notes,
      {
        key: 'status',
        get label() {
          return translate('Situação');
        },
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
    get title() {
      return translate('Acompanhamento');
    },
    read: 'FOLLOWUP_READ',
    create: 'FOLLOWUP_CREATE',
    update: 'FOLLOWUP_UPDATE',
    statuses: ['PENDING', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED'],
    fields: [
      member,
      visitor,
      {
        key: 'assignedToUserId',
        get label() {
          return translate('Responsável');
        },
        lookup: 'assignees',
        required: true,
      },
      {
        key: 'nextContactAt',
        get label() {
          return translate('Próximo contato');
        },
        type: 'datetime-local',
      },
      notes,
      {
        key: 'status',
        get label() {
          return translate('Situação');
        },
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
    get title() {
      return translate('Grupos familiares');
    },
    read: 'SMALL_GROUP_READ',
    create: 'SMALL_GROUP_MANAGE',
    update: 'SMALL_GROUP_MANAGE',
    fields: [
      name,
      description,
      leader,
      {
        key: 'coLeaderMemberId',
        get label() {
          return translate('Co-líder');
        },
        lookup: 'people',
      },
      {
        key: 'hostMemberId',
        get label() {
          return translate('Anfitrião');
        },
        lookup: 'people',
      },
      {
        key: 'address',
        get label() {
          return translate('Endereço');
        },
      },
      {
        key: 'meetingDay',
        get label() {
          return translate('Dia da semana');
        },
        options: ['0', '1', '2', '3', '4', '5', '6'],
        required: true,
      },
      {
        key: 'meetingTime',
        get label() {
          return translate('Horário');
        },
        type: 'time',
        required: true,
      },
      {
        key: 'capacity',
        get label() {
          return translate('Capacidade');
        },
        type: 'number',
      },
      active,
    ],
  },
  ministries: {
    get title() {
      return translate('Ministérios');
    },
    read: 'MINISTRY_READ',
    create: 'MINISTRY_MANAGE',
    update: 'MINISTRY_MANAGE',
    fields: [name, description, leader, active],
  },
  events: {
    get title() {
      return translate('Eventos');
    },
    read: 'EVENT_READ',
    create: 'EVENT_MANAGE',
    update: 'EVENT_MANAGE',
    statuses: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
    fields: [
      {
        key: 'title',
        get label() {
          return translate('Título');
        },
        required: true,
      },
      description,
      {
        key: 'type',
        get label() {
          return translate('Tipo');
        },
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
      {
        key: 'location',
        get label() {
          return translate('Local');
        },
        required: true,
      },
      {
        key: 'startDateTime',
        get label() {
          return translate('Início');
        },
        type: 'datetime-local',
        required: true,
      },
      {
        key: 'endDateTime',
        get label() {
          return translate('Fim');
        },
        type: 'datetime-local',
        required: true,
      },
      {
        key: 'capacity',
        get label() {
          return translate('Capacidade');
        },
        type: 'number',
      },
      {
        key: 'isPaid',
        get label() {
          return translate('Evento pago');
        },
        type: 'boolean',
      },
      {
        key: 'registrationRequired',
        get label() {
          return translate('Inscrição obrigatória');
        },
        type: 'boolean',
      },
      {
        key: 'ministryId',
        get label() {
          return translate('Ministério');
        },
        lookup: 'ministries',
      },
      {
        key: 'smallGroupId',
        get label() {
          return translate('Grupo familiar');
        },
        lookup: 'small-groups',
      },
      active,
      {
        key: 'status',
        get label() {
          return translate('Situação');
        },
        options: ['SCHEDULED', 'COMPLETED', 'CANCELLED'],
      },
    ],
  },
  schedules: {
    get title() {
      return translate('Escalas');
    },
    read: 'SCHEDULE_READ',
    create: 'SCHEDULE_MANAGE',
    update: 'SCHEDULE_MANAGE',
    statuses: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
    fields: [
      {
        key: 'title',
        get label() {
          return translate('Título');
        },
        required: true,
      },
      {
        key: 'eventId',
        get label() {
          return translate('Evento (opcional)');
        },
        lookup: 'events',
      },
      {
        key: 'ministryId',
        get label() {
          return translate('Ministério');
        },
        lookup: 'ministries',
        required: true,
        managedOnly: true,
      },
      {
        key: 'date',
        get label() {
          return translate('Data e hora');
        },
        type: 'datetime-local',
        required: true,
      },
      notes,
      {
        key: 'status',
        get label() {
          return translate('Situação');
        },
        options: ['DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED'],
      },
    ],
  },
  notifications: {
    get title() {
      return translate('Notificações');
    },
    read: 'NOTIFICATION_READ',
    create: 'NOTIFICATION_SEND',
    update: 'NOTIFICATION_SEND',
    statuses: ['PENDING', 'SENT', 'FAILED', 'CANCELLED'],
    fields: [
      {
        key: 'audience',
        get label() {
          return translate('Enviar para');
        },
        required: true,
        options: [
          'MEMBER',
          'VISITOR',
          'SMALL_GROUPS',
          'MINISTRIES',
          'ROLES',
          'ALL',
        ],
        optionLabels: {
          get MEMBER() {
            return translate('Membros');
          },
          get VISITOR() {
            return translate('Visitantes');
          },
          get SMALL_GROUPS() {
            return translate('Grupos familiares');
          },
          get MINISTRIES() {
            return translate('Ministérios');
          },
          get ROLES() {
            return translate('Roles');
          },
          get ALL() {
            return translate('Todos os membros');
          },
        },
      },
      {
        ...member,
        key: 'recipientMemberIds',
        get label() {
          return translate('Destinatários: membros');
        },
        multiple: true,
        required: true,
      },
      {
        ...visitor,
        key: 'recipientVisitorIds',
        get label() {
          return translate('Destinatários: visitantes');
        },
        multiple: true,
        required: true,
      },
      {
        key: 'smallGroupIds',
        get label() {
          return translate('Grupos familiares');
        },
        lookup: 'notification-audiences/small-groups',
        multiple: true,
        required: true,
      },
      {
        key: 'ministryIds',
        get label() {
          return translate('Ministérios');
        },
        lookup: 'notification-audiences/ministries',
        multiple: true,
        required: true,
      },
      {
        key: 'roleIds',
        get label() {
          return translate('Roles');
        },
        lookup: 'notification-audiences/roles',
        multiple: true,
        required: true,
      },
      {
        key: 'channel',
        get label() {
          return translate('Canal');
        },
        options: ['INTERNAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'],
        optionLabels: {
          get INTERNAL() {
            return translate('Interna (com alerta push para quem ativou)');
          },
          get PUSH() {
            return translate('Push (exige um dispositivo inscrito)');
          },
        },
        required: true,
      },
      {
        key: 'subject',
        get label() {
          return translate('Assunto');
        },
      },
      {
        key: 'content',
        get label() {
          return translate('Mensagem');
        },
        type: 'textarea',
        required: true,
      },
      {
        key: 'scheduledAt',
        get label() {
          return translate('Agendamento');
        },
        type: 'datetime-local',
      },
    ],
  },
  'notification-templates': {
    get title() {
      return translate('Modelos de mensagem');
    },
    read: 'NOTIFICATION_READ',
    create: 'NOTIFICATION_SEND',
    update: 'NOTIFICATION_SEND',
    fields: [
      name,
      {
        key: 'channel',
        get label() {
          return translate('Canal');
        },
        options: ['INTERNAL', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'],
        required: true,
      },
      {
        key: 'subject',
        get label() {
          return translate('Assunto');
        },
      },
      {
        key: 'content',
        get label() {
          return translate('Mensagem');
        },
        type: 'textarea',
        required: true,
      },
      active,
    ],
  },
};
export const operationLabels: Record<string, string> = {
  get NEW() {
    return translate('Novo');
  },
  get CONTACTED() {
    return translate('Contatado');
  },
  get IN_FOLLOW_UP() {
    return translate('Em acompanhamento');
  },
  get INTEGRATING() {
    return translate('Em integração');
  },
  get INTEGRATED() {
    return translate('Integrado');
  },
  get INACTIVE() {
    return translate('Inativo');
  },
  get ARCHIVED() {
    return translate('Arquivado');
  },
  get PENDING() {
    return translate('Pendente');
  },
  get IN_PROGRESS() {
    return translate('Em andamento');
  },
  get WAITING() {
    return translate('Aguardando');
  },
  get COMPLETED() {
    return translate('Concluído');
  },
  get CANCELLED() {
    return translate('Cancelado');
  },
  get DRAFT() {
    return translate('Rascunho');
  },
  get PUBLISHED() {
    return translate('Publicado');
  },
  get ABSENT() {
    return translate('Ausente');
  },
  get REGISTERED() {
    return translate('Inscrito');
  },
  get INVITED() {
    return translate('Convidado');
  },
  get CONFIRMED() {
    return translate('Confirmado');
  },
  get DECLINED() {
    return translate('Recusado');
  },
  get REPLACED() {
    return translate('Substituído');
  },
  get SENT() {
    return translate('Enviado');
  },
  get FAILED() {
    return translate('Falhou');
  },
  get SCHEDULED() {
    return translate('Agendado');
  },
  get PHONE() {
    return translate('Telefone');
  },
  get WHATSAPP() {
    return translate('WhatsApp');
  },
  EMAIL: 'E-mail',
  get IN_PERSON() {
    return translate('Presencial');
  },
  get OTHER() {
    return translate('Outro');
  },
  get INTERNAL() {
    return translate('Interno');
  },
  SMS: 'SMS',
  get PUSH() {
    return translate('Push');
  },
  get LEADER() {
    return translate('Líder');
  },
  get CO_LEADER() {
    return translate('Co-líder');
  },
  get HOST() {
    return translate('Anfitrião');
  },
  get MEMBER() {
    return translate('Participante');
  },
  get SERVICE() {
    return translate('Culto');
  },
  get CONFERENCE() {
    return translate('Conferência');
  },
  get MEETING() {
    return translate('Reunião');
  },
  get TRAINING() {
    return translate('Formação');
  },
  get SMALL_GROUP() {
    return translate('Grupo familiar');
  },
  get MINISTRY() {
    return translate('Ministério');
  },
  get SPECIAL() {
    return translate('Especial');
  },
  get FEMALE() {
    return translate('Feminino');
  },
  get MALE() {
    return translate('Masculino');
  },
  get UNDISCLOSED() {
    return translate('Não informado');
  },
};
export const dayLabels = localized([
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]);
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
      translate('Registro'),
  );
