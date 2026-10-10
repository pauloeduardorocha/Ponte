import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Link,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useAuth } from '../../auth/auth-context';
import { apiRequest } from '../../lib/api';
type PublicEvent = {
  name: string;
  description?: string;
  location: string;
  startsAt: string;
  isPaid: boolean;
  available: number | null;
  paymentsReady: boolean;
  tickets: { id: string; name: string; price: string; available: number }[];
};
export function PublicEventRegistration() {
  const { id } = useParams();
  const { user, status } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const [visitor, setVisitor] = useState(false);
  const [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [phone, setPhone] = useState('');
  const [ticketId, setTicketId] = useState(''),
    [consent, setConsent] = useState(false);
  const event = useQuery({
    queryKey: ['public-event', id],
    queryFn: () => apiRequest<PublicEvent>(`/public/events/${id}`),
  });
  const profile = useQuery({
    queryKey: ['event-member-profile', user?.id],
    queryFn: () =>
      apiRequest<{ name: string; email?: string; phone?: string }>(
        `/public/events/${id}/profile`,
      ),
    enabled: status === 'authenticated',
  });
  const member = !!profile.data && !visitor;
  const payment = useQuery({
    queryKey: ['event-payment-status', id, sessionId],
    queryFn: () =>
      apiRequest<{ status: string }>(`/public/events/${id}/payment-status`, {
        query: { sessionId },
      }),
    enabled: !!sessionId,
    refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 2000 : false),
  });
  const signup = useMutation({
    mutationFn: () =>
      apiRequest<{ checkoutUrl?: string; status: string }>(
        `/public/events/${id}/${member ? 'member-registrations' : 'registrations'}`,
        {
          method: 'POST',
          body: {
            ...(member ? {} : { name, email, phone }),
            ...(ticketId ? { ticketId } : {}),
            communicationConsent: consent,
          },
        },
      ),
    onSuccess: (result) => {
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
    },
  });
  const selected = event.data?.tickets.find((t) => t.id === ticketId);
  const requiresPayment =
    !!event.data?.isPaid && (!selected || Number(selected.price) > 0);
  return (
    <Container maxWidth="sm" sx={{ py: 5 }}>
      <Stack spacing={3}>
        <Typography variant="h4">
          {event.data?.name ?? 'Inscrição no evento'}
        </Typography>
        {event.isPending && <Typography>Carregando evento…</Typography>}
        {event.isError && <Alert severity="error">{event.error.message}</Alert>}
        {event.data && (
          <>
            <Typography>{event.data.description}</Typography>
            <Typography>
              {new Date(event.data.startsAt).toLocaleString('pt-PT')} ·{' '}
              {event.data.location}
            </Typography>
            <Typography>
              {event.data.isPaid
                ? 'Evento pago · valores em euros'
                : 'Inscrição gratuita'}
              {event.data.available !== null
                ? ` · ${event.data.available} vagas disponíveis`
                : ''}
            </Typography>
            {sessionId && (
              <Alert
                severity={
                  payment.data?.status === 'CONFIRMED' ? 'success' : 'info'
                }
              >
                {payment.data?.status === 'CONFIRMED'
                  ? 'Pagamento confirmado. Inscrição concluída!'
                  : payment.data?.status === 'REFUNDED'
                    ? 'Pagamento devolvido: a inscrição foi cancelada ou a vaga já não estava disponível.'
                    : payment.data?.status === 'FAILED'
                      ? 'Pagamento não concluído. Pode tentar novamente.'
                      : 'Aguardando confirmação do pagamento.'}
              </Alert>
            )}
            {params.has('cancelled') && (
              <Alert severity="info">
                Pagamento interrompido. A vaga fica reservada até a sessão
                expirar (35 minutos).
              </Alert>
            )}
            {signup.isSuccess && !signup.data.checkoutUrl ? (
              <Alert severity="success">Inscrição concluída!</Alert>
            ) : (
              !sessionId && (
                <>
                  {!user && (
                    <Button
                      component={Link}
                      to="/login"
                      state={{ from: { pathname: location.pathname } }}
                    >
                      Sou membro — entrar e preencher meus dados
                    </Button>
                  )}
                  {profile.isPending && user && (
                    <Typography>Carregando dados do membro…</Typography>
                  )}
                  {profile.isError && (
                    <Alert severity="info">
                      Sua conta não está associada a um membro ativo. Preencha
                      os dados como visitante.
                    </Alert>
                  )}
                  {profile.data && (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={visitor}
                          onChange={(e) => setVisitor(e.target.checked)}
                        />
                      }
                      label="Inscrever outra pessoa como visitante"
                    />
                  )}
                  <Box
                    component="form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      signup.mutate();
                    }}
                  >
                    <Stack spacing={2}>
                      <TextField
                        required
                        label="Nome"
                        value={member ? profile.data!.name : name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={member}
                        autoComplete="name"
                        inputProps={{ maxLength: 120 }}
                      />
                      <TextField
                        required={!member}
                        label="Email"
                        type="email"
                        value={member ? (profile.data!.email ?? '') : email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={member}
                        autoComplete="email"
                      />
                      <TextField
                        required={!member}
                        label="Telefone"
                        type="tel"
                        value={member ? (profile.data!.phone ?? '') : phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={member}
                        autoComplete="tel"
                        inputProps={{ maxLength: 32 }}
                      />
                      {!!event.data.tickets.length && (
                        <TextField
                          select
                          label="Lote de ingressos"
                          required={event.data.isPaid}
                          value={ticketId}
                          onChange={(e) => setTicketId(e.target.value)}
                        >
                          <MenuItem value="">Selecione um lote</MenuItem>
                          {event.data.tickets.map((t) => (
                            <MenuItem
                              key={t.id}
                              value={t.id}
                              disabled={t.available === 0}
                            >
                              {t.name} · €
                              {event.data!.isPaid ? t.price : '0.00'} ·{' '}
                              {t.available} disponíveis
                            </MenuItem>
                          ))}
                        </TextField>
                      )}
                      {!member && (
                        <Typography variant="body2">
                          Seus dados serão cadastrados como visitante para gerir
                          a inscrição.
                        </Typography>
                      )}
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={consent}
                            onChange={(e) => setConsent(e.target.checked)}
                          />
                        }
                        label="Quero receber comunicações sobre este evento"
                      />
                      {requiresPayment && !event.data.paymentsReady && (
                        <Alert severity="info">
                          A compra de ingressos estará disponível quando os
                          pagamentos forem configurados.
                        </Alert>
                      )}
                      {signup.isError && (
                        <Alert severity="error">{signup.error.message}</Alert>
                      )}
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={
                          signup.isPending ||
                          status === 'loading' ||
                          (!!user && profile.isPending) ||
                          event.data.available === 0 ||
                          (requiresPayment && !event.data.paymentsReady)
                        }
                      >
                        {signup.isPending
                          ? 'Processando…'
                          : requiresPayment
                            ? 'Comprar ingresso'
                            : 'Confirmar inscrição gratuita'}
                      </Button>
                    </Stack>
                  </Box>
                </>
              )
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
