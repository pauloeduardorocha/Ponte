import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined';
import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../lib/api';
import { QueryError } from './PageParts';

export function BirthdaysCard() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['community', 'birthdays', 'week', user?.id],
    queryFn: () =>
      apiRequest<{ id: string; name: string; birthday: string }[]>(
        '/community/birthdays?period=week',
      ),
    staleTime: 60000,
    refetchInterval: 60000,
  });
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <CakeOutlinedIcon color="primary" />
            <Typography component="h2" variant="h6">
              Aniversariantes da semana
            </Typography>
          </Stack>
          {query.isPending && (
            <Skeleton aria-label="Carregando aniversariantes" height={48} />
          )}
          {query.isError && (
            <QueryError
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          )}
          {query.data &&
            (query.data.length ? (
              <>
                <Typography color="text.secondary">
                  Celebramos os aniversariantes desta semana!
                </Typography>
                <Stack
                  component="ul"
                  spacing={1.5}
                  sx={{ listStyle: 'none', p: 0, m: 0 }}
                >
                  {query.data.map((member) => (
                    <Stack
                      component="li"
                      key={member.id}
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                    >
                      <Avatar
                        aria-hidden="true"
                        sx={{ bgcolor: 'primary.main' }}
                      >
                        {member.name.charAt(0).toLocaleUpperCase('pt-PT')}
                      </Avatar>
                      <Typography fontWeight={600}>{member.name}</Typography>
                      <Typography color="text.secondary">
                        {member.birthday}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              </>
            ) : (
              <Typography color="text.secondary">
                Nenhum aniversariante nesta semana.
              </Typography>
            ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
