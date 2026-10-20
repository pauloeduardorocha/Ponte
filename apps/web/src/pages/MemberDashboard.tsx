import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { QueryError } from '../components/PageParts';

type Book = { title: string };
type Dashboard = {
  upcomingSchedules: {
    id: string;
    title: string;
    date: string;
    ministry: { name: string } | null;
  }[];
  groups: {
    id: string;
    name: string;
    address: string | null;
    meetingDay: number | null;
    meetingTime: string | null;
    leader: { name: string } | null;
  }[];
  reimbursements: {
    id: string;
    purpose: string;
    amount: string | null;
    currency: string;
  }[];
  upcomingEvents: {
    id: string;
    name: string;
    startsAt: string;
    location: string;
  }[];
  reservations: { id: string; status: string; expiresAt: string; book: Book }[];
  loans: {
    id: string;
    status: string;
    dueAt: string;
    bookCopy: { book: Book };
  }[];
  fines: {
    id: string;
    amount: string;
    paidAmount: string;
    discount: string;
    loan: { bookCopy: { book: Book } };
  }[];
};
const date = (value: string) => new Date(value).toLocaleString('pt-PT');
const days = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography component="h2" variant="h6">
            {title}
          </Typography>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}

export function MemberDashboard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['member-portal', 'dashboard', user?.id],
    queryFn: () => apiRequest<Dashboard>('/member-portal/dashboard'),
    staleTime: 30000,
  });
  if (query.isPending)
    return (
      <Skeleton
        variant="rounded"
        height={240}
        aria-label="Carregando seu painel"
      />
    );
  if (query.isError)
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  const d = query.data;
  return (
    <>
      <Section title="Próximas escalas">
        {d.upcomingSchedules.length ? (
          d.upcomingSchedules.map((s) => (
            <Stack key={s.id}>
              <Typography fontWeight={600}>{s.title}</Typography>
              <Typography>
                {date(s.date)}
                {s.ministry ? ` · ${s.ministry.name}` : ''}
              </Typography>
            </Stack>
          ))
        ) : (
          <Typography color="text.secondary">
            Você não tem próximas escalas.
          </Typography>
        )}
        <Button component={Link} to="/schedules">
          Ver escalas
        </Button>
      </Section>
      <Section title="Meu grupo familiar">
        {d.groups.length ? (
          d.groups.map((g) => (
            <Stack key={g.id}>
              <Typography fontWeight={600}>{g.name}</Typography>
              {g.leader && <Typography>Líder: {g.leader.name}</Typography>}
              {g.address && <Typography>{g.address}</Typography>}
              {(g.meetingDay !== null || g.meetingTime) && (
                <Typography>
                  {g.meetingDay !== null ? days[g.meetingDay] : ''}
                  {g.meetingTime ? ` às ${g.meetingTime}` : ''}
                </Typography>
              )}
            </Stack>
          ))
        ) : (
          <Typography color="text.secondary">
            Você ainda não faz parte de um grupo familiar.
          </Typography>
        )}
        <Button component={Link} to="/small-groups?view=community">
          Ver grupos familiares
        </Button>
      </Section>
      {d.reimbursements.length > 0 && (
        <Section title="Reembolsos pendentes">
          {d.reimbursements.map((r) => (
            <Stack key={r.id}>
              <Typography>
                {r.purpose || 'Reembolso em preenchimento'}
              </Typography>
              <Typography>
                {r.amount !== null
                  ? new Intl.NumberFormat('pt-PT', {
                      style: 'currency',
                      currency: r.currency,
                    }).format(Number(r.amount))
                  : 'Valor por informar'}
              </Typography>
              <Button component={Link} to={`/reimbursements?request=${r.id}`}>
                Ver reembolso
              </Button>
            </Stack>
          ))}
        </Section>
      )}
      <Section title="Próximos eventos">
        {d.upcomingEvents.length ? (
          d.upcomingEvents.map((e) => (
            <Stack key={e.id}>
              <Typography fontWeight={600}>{e.name}</Typography>
              <Typography>
                {date(e.startsAt)} · {e.location}
              </Typography>
              <Button component={Link} to={`/events/${e.id}/register`}>
                Ver evento e inscrever-se
              </Button>
            </Stack>
          ))
        ) : (
          <Typography color="text.secondary">
            Nenhum evento agendado.
          </Typography>
        )}
      </Section>
      {(d.reservations.length > 0 ||
        d.loans.length > 0 ||
        d.fines.length > 0) && (
        <Section title="Minha biblioteca">
          {d.reservations.map((r) => (
            <Typography key={r.id}>
              Reserva: {r.book.title} ·{' '}
              {r.status === 'READY' ? 'Disponível para retirada' : 'Em espera'}{' '}
              · Até {date(r.expiresAt)}
            </Typography>
          ))}
          {d.loans.map((l) => (
            <Typography key={l.id}>
              Empréstimo: {l.bookCopy.book.title} · Devolução: {date(l.dueAt)}
              {l.status === 'LOST'
                ? ' · Perdido'
                : l.status === 'OVERDUE' || new Date(l.dueAt) < new Date()
                  ? ' · Em atraso'
                  : ''}
            </Typography>
          ))}
          {d.fines.map((f) => (
            <Typography key={f.id}>
              Multa: {f.loan.bookCopy.book.title} · Saldo pendente:{' '}
              {Math.max(
                0,
                Number(f.amount) - Number(f.paidAmount) - Number(f.discount),
              ).toLocaleString('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Typography>
          ))}
          <Button component={Link} to="/library">
            Ver biblioteca
          </Button>
        </Section>
      )}
    </>
  );
}
