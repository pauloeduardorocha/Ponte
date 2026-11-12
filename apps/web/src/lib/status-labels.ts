import { t as translate } from '../i18n';
export const STATUS_LABELS: Record<string, string> = {
  get UPLOADED() {
    return translate('Enviado');
  },
  get PROCESSING() {
    return translate('Processando');
  },
  get READY_FOR_REVIEW() {
    return translate('Pronto para revisão');
  },
  get CONFIRMED() {
    return translate('Confirmado');
  },
  get FAILED() {
    return translate('Falhou');
  },
  get ACTIVE() {
    return translate('Ativo');
  },
  get INACTIVE() {
    return translate('Inativo');
  },
  get INVITED() {
    return translate('Convidado');
  },
  get DISABLED() {
    return translate('Desativado');
  },
  get PENDING() {
    return translate('Pendente');
  },
  get PENDING_APPROVAL() {
    return translate('Aguardando aprovação');
  },
  get COMPLETED() {
    return translate('Concluído');
  },
  get CANCELLED() {
    return translate('Cancelado');
  },
  get PENDING_INVENTORY() {
    return translate('Por conferir');
  },
  get NOT_ASSESSED() {
    return translate('Por avaliar');
  },
  get AVAILABLE() {
    return translate('Disponível');
  },
  get LOANED() {
    return translate('Emprestado');
  },
  get RETURNED() {
    return translate('Devolvido');
  },
  get EXPIRED() {
    return translate('Expirado');
  },
  get RESERVED() {
    return translate('Reservado');
  },
  get OVERDUE() {
    return translate('Em atraso');
  },
  get LOST() {
    return translate('Perdido');
  },
  get MAINTENANCE() {
    return translate('Manutenção');
  },
  get DISPOSED() {
    return translate('Retirado');
  },
  get OPEN() {
    return translate('Em aberto');
  },
  get PAID() {
    return translate('Pago');
  },
  get FORGIVEN() {
    return translate('Perdoado');
  },
  get WAITING() {
    return translate('Em espera');
  },
  get READY() {
    return translate('Pronto');
  },
  get FULFILLED() {
    return translate('Atendido');
  },
  get NEW() {
    return translate('Novo');
  },
  get CONTACTED() {
    return translate('Contactado');
  },
  get ARCHIVED() {
    return translate('Arquivado');
  },
  get SCHEDULED() {
    return translate('Agendado');
  },
  get CLASSIFIED() {
    return translate('Classificado');
  },
  get RECONCILED() {
    return translate('Cadastrado');
  },
  get PENDING_REVIEW() {
    return translate('Revisão pendente');
  },
  get POSSIBLE_DUPLICATE() {
    return translate('Possível duplicidade');
  },
  get REJECTED() {
    return translate('Ignorado');
  },
  get INCOME() {
    return translate('Receita');
  },
  get EXPENSE() {
    return translate('Despesa');
  },
  get TITHE() {
    return translate('Dízimo');
  },
  get OFFERING() {
    return translate('Oferta');
  },
  get DONATION() {
    return translate('Doação');
  },
  get OTHER() {
    return translate('Outro');
  },
};

// Operational vocabulary shares the same badges throughout the application.
import { operationLabels } from '../pages/operations/operation-config';
for (const key of Object.keys(operationLabels)) {
  Object.defineProperty(STATUS_LABELS, key, {
    configurable: true,
    enumerable: true,
    get: () => operationLabels[key],
  });
}
