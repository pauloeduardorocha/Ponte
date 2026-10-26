import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';

const calendarId =
  'f23297160cd4f586f47a6b40095d5a0c381206d416d717dc850099d53ec0114a@group.calendar.google.com';
const calendarLink = `https://calendar.google.com/calendar/u/0?cid=${btoa(calendarId)}`;
const subscriptionLink = `webcal://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`;
const embedLink = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(calendarId)}&hl=pt_PT&mode=MONTH`;

export function CalendarPage() {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          Calendário
        </Typography>
        <Typography color="text.secondary">
          Acompanhe as datas e a programação da igreja.
        </Typography>
      </Box>
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2">
            No seu dispositivo
          </Typography>
          <Typography>
            Adicione o calendário à sua conta Google e ative a sincronização no
            seu celular, ou assine pelo aplicativo de calendário do dispositivo
            para acompanhar as atualizações.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button
              href={calendarLink}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              startIcon={<CalendarMonthRounded />}
            >
              Adicionar ao Google Agenda
            </Button>
            <Button href={subscriptionLink} variant="outlined">
              Assinar no dispositivo
            </Button>
            <Button
              href={calendarLink}
              target="_blank"
              rel="noopener noreferrer"
              startIcon={<OpenInNewRounded />}
            >
              Abrir no Google Agenda
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Para assinar, é necessário um aplicativo compatível com calendários
            por assinatura.
          </Typography>
        </Stack>
      </Paper>
      <Alert severity="info">
        Se o calendário não aparecer, abra no Google Agenda. A visualização aqui
        e a assinatura no dispositivo precisam que o calendário esteja
        compartilhado publicamente.
      </Alert>
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        <Box
          component="iframe"
          src={embedLink}
          title="Calendário da igreja"
          sx={{
            display: 'block',
            width: '100%',
            height: { xs: '70vh', md: 760 },
            minHeight: 480,
            border: 0,
          }}
        />
      </Paper>
    </Stack>
  );
}
