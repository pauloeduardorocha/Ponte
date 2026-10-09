import { Suspense, useState, type ReactNode } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Container,
  Collapse,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AccountBalanceRounded,
  AdminPanelSettingsRounded,
  CalendarMonthRounded,
  DashboardRounded,
  ExpandMoreRounded,
  ExpandLessRounded,
  LogoutRounded,
  ManageAccountsRounded,
  MenuRounded,
  NotificationsNoneRounded,
  PeopleAltRounded,
  MenuBookRounded,
} from '@mui/icons-material';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { initials } from '../lib/format';
import type { Permission } from '../lib/types';
import { AUDIT_PERMISSIONS } from '../lib/audit-permissions';

const sidebarWidth = 264;

const navigationGroups = [
  'Início',
  'Pessoas',
  'Grupos e ministérios',
  'Eventos',
  'Operação',
  'Recursos',
  'Comunicação',
  'Administração',
] as const;
type NavigationGroup = (typeof navigationGroups)[number];

interface NavigationItem {
  label: string;
  to: string;
  icon: typeof DashboardRounded;
  group: NavigationGroup;
  permission?: Permission;
  permissions?: Permission[];
  anyPermissions?: Permission[];
  permissionPrefix?: 'LIBRARY_' | 'FINANCE_';
}

const navigation: NavigationItem[] = [
  {
    label: 'Meus eventos',
    group: 'Eventos',
    to: '/my-events',
    icon: CalendarMonthRounded,
    permission: 'EVENT_REGISTRATION_READ',
  },
  {
    label: 'Criar evento',
    group: 'Eventos',
    to: '/my-events?create=true',
    icon: CalendarMonthRounded,
    permission: 'EVENT_CREATE',
  },
  {
    label: 'Inscrições',
    group: 'Eventos',
    to: '/my-events?section=registrations',
    icon: PeopleAltRounded,
    permission: 'EVENT_REGISTRATION_READ',
  },
  {
    label: 'Participantes',
    group: 'Eventos',
    to: '/my-events?section=attendees',
    icon: PeopleAltRounded,
    permission: 'EVENT_ATTENDEE_READ',
  },
  {
    label: 'Ingressos',
    group: 'Eventos',
    to: '/my-events?section=tickets',
    icon: CalendarMonthRounded,
    permission: 'EVENT_TICKET_MANAGE',
  },
  {
    label: 'Pagamentos',
    group: 'Eventos',
    to: '/my-events?section=payments',
    icon: CalendarMonthRounded,
    permission: 'EVENT_PAYMENT_READ',
  },
  {
    label: 'Credenciamento',
    group: 'Eventos',
    to: '/my-events?section=checkin',
    icon: PeopleAltRounded,
    permission: 'EVENT_CHECKIN',
  },
  {
    label: 'Relatórios',
    group: 'Eventos',
    to: '/my-events?section=reports',
    icon: CalendarMonthRounded,
    permission: 'EVENT_REPORT_READ',
  },
  {
    label: 'Vida da igreja',
    group: 'Operação',
    to: '/operations',
    icon: DashboardRounded,
    anyPermissions: [
      'VISITOR_READ',
      'FOLLOWUP_READ',
      'SMALL_GROUP_READ',
      'MINISTRY_READ',
      'EVENT_READ',
      'SCHEDULE_READ',
      'ATTENDANCE_READ',
    ],
  },
  {
    label: 'Auditoria',
    group: 'Administração',
    to: '/audit',
    icon: AdminPanelSettingsRounded,
    permissions: AUDIT_PERMISSIONS,
  },
  { label: 'Visão geral', group: 'Início', to: '/', icon: DashboardRounded },
  {
    label: 'Membros',
    group: 'Pessoas',
    to: '/members',
    icon: PeopleAltRounded,
    permission: 'MEMBER_READ',
  },
  {
    label: 'Eventos',
    group: 'Eventos',
    to: '/events',
    icon: CalendarMonthRounded,
    permission: 'EVENT_READ',
  },
  {
    label: 'Visitantes',
    group: 'Pessoas',
    to: '/visitors',
    icon: PeopleAltRounded,
    permission: 'VISITOR_READ',
  },
  {
    label: 'Acompanhamento',
    group: 'Pessoas',
    to: '/follow-ups',
    icon: PeopleAltRounded,
    permission: 'FOLLOWUP_READ',
  },
  {
    label: 'Grupos familiares',
    group: 'Grupos e ministérios',
    to: '/small-groups',
    icon: PeopleAltRounded,
    permission: 'SMALL_GROUP_READ',
  },
  {
    label: 'Ministérios',
    group: 'Grupos e ministérios',
    to: '/ministries',
    icon: PeopleAltRounded,
    permission: 'MINISTRY_READ',
  },
  {
    label: 'Escalas',
    group: 'Operação',
    to: '/schedules',
    icon: CalendarMonthRounded,
    permission: 'SCHEDULE_READ',
  },
  {
    label: 'Presenças',
    group: 'Operação',
    to: '/attendance',
    icon: PeopleAltRounded,
    permission: 'ATTENDANCE_READ',
  },
  {
    label: 'Notificações',
    group: 'Comunicação',
    to: '/notifications',
    icon: NotificationsNoneRounded,
    permission: 'NOTIFICATION_READ',
  },
  {
    label: 'Biblioteca',
    group: 'Recursos',
    to: '/library',
    icon: MenuBookRounded,
    permissionPrefix: 'LIBRARY_',
  },
  {
    label: 'Financeiro',
    group: 'Recursos',
    to: '/finance',
    icon: AccountBalanceRounded,
    permissionPrefix: 'FINANCE_',
  },
  {
    label: 'Usuários',
    group: 'Administração',
    to: '/users',
    icon: AdminPanelSettingsRounded,
    permission: 'USER_READ',
  },
];

// Event workspace shortcuts share a path; select only the current task.
function isNavigationActive(
  to: string,
  location: { pathname: string; search: string },
) {
  const [pathname, search = ''] = to.split('?');
  if (pathname !== '/my-events') {
    return (
      location.pathname === pathname ||
      (pathname !== '/' && location.pathname.startsWith(`${pathname}/`))
    );
  }
  if (location.pathname !== pathname) return false;
  const current = new URLSearchParams(location.search);
  const target = new URLSearchParams(search);
  if (current.get('create') === 'true') return target.get('create') === 'true';
  return (
    !target.has('create') && current.get('section') === target.get('section')
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState<NavigationGroup[]>([]);
  function toggleGroup(group: NavigationGroup) {
    setExpandedGroups((current) =>
      current.includes(group)
        ? current.filter((item) => item !== group)
        : [...current, group],
    );
  }
  const items = [...navigation]
    .sort(
      (a, b) =>
        navigationGroups.indexOf(a.group) - navigationGroups.indexOf(b.group),
    )
    .filter(({ permissionPrefix, permission, permissions, anyPermissions }) =>
      anyPermissions
        ? anyPermissions.some(hasPermission)
        : permissions
          ? permissions.every(hasPermission)
          : permissionPrefix
            ? user?.permissions.some((code) =>
                code.startsWith(permissionPrefix),
              )
            : !permission || hasPermission(permission),
    );

  return (
    <Box className="sidebar">
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        sx={{ px: 3, py: 3 }}
      >
        <Box className="brand-mark">C</Box>
        <Box>
          <Typography fontWeight={700} lineHeight={1.2}>
            Comunidade
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Gestão da Igreja
          </Typography>
        </Box>
      </Stack>

      <List className="navigation-list" disablePadding>
        {navigationGroups.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          const expanded = group === 'Início' || expandedGroups.includes(group);
          const groupId = `navigation-group-${navigationGroups.indexOf(group)}`;
          return (
            <Box key={group}>
              {group !== 'Início' && (
                <ListItemButton
                  onClick={() => toggleGroup(group)}
                  aria-expanded={expanded}
                  aria-controls={groupId}
                  className="navigation-group-toggle"
                  sx={{
                    borderRadius: 2,
                    mt: 0.5,
                    fontWeight: 700,
                    color: groupItems.some((item) =>
                      isNavigationActive(item.to, location),
                    )
                      ? 'primary.main'
                      : 'text.secondary',
                  }}
                >
                  <ListItemText
                    primary={group}
                    primaryTypographyProps={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                    }}
                  />
                  {expanded ? (
                    <ExpandLessRounded fontSize="small" />
                  ) : (
                    <ExpandMoreRounded fontSize="small" />
                  )}
                </ListItemButton>
              )}
              <Collapse in={expanded} id={groupId}>
                <List
                  disablePadding
                  aria-label={group}
                  sx={{ pl: group === 'Início' ? 0 : 1 }}
                >
                  {groupItems.map(({ label, to, icon: Icon }) => (
                    <ListItemButton
                      key={to}
                      component={Link}
                      to={to}
                      aria-current={
                        isNavigationActive(to, location) ? 'page' : undefined
                      }
                      onClick={onNavigate}
                      className={`navigation-link${isNavigationActive(to, location) ? ' active' : ''}`}
                      sx={{
                        '&.active': {
                          color: 'primary.main',
                          backgroundColor: 'rgba(36, 91, 74, 0.09)',
                          '& .MuiListItemIcon-root': { color: 'primary.main' },
                        },
                      }}
                    >
                      <ListItemIcon>
                        <Icon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText primary={label} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>

      <Box className="sidebar-footer">
        <Divider sx={{ mb: 2 }} />
        <Typography variant="caption" color="text.secondary">
          Plataforma em configuração
        </Typography>
      </Box>
    </Box>
  );
}

function ProfileMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  async function handleLogout() {
    setAnchor(null);
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <Tooltip title="Minha conta">
        <IconButton
          aria-label="Abrir menu da conta"
          onClick={(event) => setAnchor(event.currentTarget)}
          size="small"
        >
          <Avatar className="profile-avatar">{initials(user?.name)}</Avatar>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography fontWeight={600}>{user?.name}</Typography>
          <Typography variant="body2" color="text.secondary">
            {user?.email}
          </Typography>
        </Box>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate('/account');
          }}
        >
          <ListItemIcon>
            <ManageAccountsRounded fontSize="small" />
          </ListItemIcon>
          Minha conta
        </MenuItem>
        <MenuItem onClick={() => void handleLogout()}>
          <ListItemIcon>
            <LogoutRounded fontSize="small" />
          </ListItemIcon>
          Sair
        </MenuItem>
      </Menu>
    </>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <Box className="app-shell">
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        className="app-header"
        sx={{
          width: { md: `calc(100% - ${sidebarWidth}px)` },
          ml: { md: `${sidebarWidth}px` },
        }}
      >
        <Toolbar className="header-toolbar">
          {!isDesktop && (
            <IconButton
              aria-label="Abrir menu"
              edge="start"
              onClick={() => setDrawerOpen(true)}
            >
              <MenuRounded />
            </IconButton>
          )}
          <Typography fontWeight={600} sx={{ flexGrow: 1 }}>
            Painel da comunidade
          </Typography>
          <Tooltip title="Notificações">
            <IconButton
              component={NavLink}
              to="/inbox"
              aria-label="Notificações"
            >
              <NotificationsNoneRounded />
            </IconButton>
          </Tooltip>
          <ProfileMenu />
        </Toolbar>
      </AppBar>

      <Box component="nav" aria-label="Navegação principal">
        <Drawer
          variant={isDesktop ? 'permanent' : 'temporary'}
          open={isDesktop || drawerOpen}
          onClose={() => setDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': {
              width: sidebarWidth,
              boxSizing: 'border-box',
            },
          }}
        >
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </Drawer>
      </Box>

      <Box
        component="main"
        className="main-content"
        sx={{
          ml: { md: `${sidebarWidth}px` },
          minWidth: 0,
        }}
      >
        <Toolbar className="header-spacer" />
        <Container maxWidth="xl" className="dashboard-content">
          <Suspense fallback={<LinearProgress aria-label="Carregando tela" />}>
            {children ?? <Outlet />}
          </Suspense>
        </Container>
      </Box>
    </Box>
  );
}
