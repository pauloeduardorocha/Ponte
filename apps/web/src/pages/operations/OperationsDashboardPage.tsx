import { Alert } from '@mui/material';
import { useAuth } from '../../auth/auth-context';
import { OperationalDashboard } from './OperationalDashboard';
export function OperationsDashboardPage() {
  const { user } = useAuth();
  return user?.permissions.some((p) =>
    [
      'VISITOR_READ',
      'FOLLOWUP_READ',
      'SMALL_GROUP_READ',
      'MINISTRY_READ',
      'EVENT_READ',
      'SCHEDULE_READ',
      'ATTENDANCE_READ',
    ].includes(p),
  ) ? (
    <OperationalDashboard />
  ) : (
    <Alert severity="warning">
      Você não tem permissão para acessar este painel.
    </Alert>
  );
}
