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
import AccountBalanceRounded from '@mui/icons-material/AccountBalanceRounded';
import AdminPanelSettingsRounded from '@mui/icons-material/AdminPanelSettingsRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import DashboardRounded from '@mui/icons-material/DashboardRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRounded from '@mui/icons-material/ExpandLessRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import ManageAccountsRounded from '@mui/icons-material/ManageAccountsRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import { NotificationBell } from '../components/NotificationBell';
import { PushPermissionBanner } from '../components/PushPermissionBanner';
import PeopleAltRounded from '@mui/icons-material/PeopleAltRounded';
import MenuBookRounded from '@mui/icons-material/MenuBookRounded';
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
  'Operação',
  'Eventos',
  'Financeiro',
  'Biblioteca',
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
    label: 'Gestão de eventos',
    group: 'Eventos',
    to: '/my-events',
    icon: CalendarMonthRounded,
    permission: 'EVENT_READ',
  },
  {
    label: 'Vida da igreja',
    group: 'Operação',
    to: '/operations',
    icon: DashboardRounded,
    anyPermissions: [
      'MEMBER_READ',
      'VISITOR_READ',
      'FOLLOWUP_READ',
      'SMALL_GROUP_READ',
      'MINISTRY_READ',
      'EVENT_READ',
      'SCHEDULE_READ',
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
    label: 'Agenda de eventos',
    group: 'Eventos',
    to: '/events?view=community',
    icon: CalendarMonthRounded,
    anyPermissions: ['EVENT_READ', 'COMMUNITY_READ'],
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
    to: '/small-groups?view=community',
    icon: PeopleAltRounded,
    anyPermissions: ['SMALL_GROUP_READ', 'COMMUNITY_READ'],
  },
  {
    label: 'Ministérios',
    group: 'Grupos e ministérios',
    to: '/ministries?view=community',
    icon: PeopleAltRounded,
    anyPermissions: ['MINISTRY_READ', 'COMMUNITY_READ'],
  },
  {
    label: 'Escalas',
    group: 'Operação',
    to: '/schedules',
    icon: CalendarMonthRounded,
    permission: 'COMMUNITY_READ',
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
    group: 'Biblioteca',
    to: '/library',
    icon: MenuBookRounded,
    permissionPrefix: 'LIBRARY_',
  },
  {
    label: 'Financeiro',
    group: 'Financeiro',
    to: '/finance',
    icon: AccountBalanceRounded,
    permissionPrefix: 'FINANCE_',
  },
  {
    label: 'Meus reembolsos',
    group: 'Financeiro',
    to: '/reimbursements',
    icon: AccountBalanceRounded,
  },
];

function isNavigationActive(to: string, location: { pathname: string }) {
  const [pathname] = to.split('?');
  return (
    location.pathname === pathname ||
    (pathname !== '/' && location.pathname.startsWith(`${pathname}/`))
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
        <Box
          component="img"
          src="/logo.jpg"
          alt="Logo de A Ponte"
          width={42}
          height={42}
          className="brand-mark"
        />
        <Box>
          <Typography fontWeight={700} lineHeight={1.2}>
            A Ponte
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
          const headerless = [
            'Início',
            'Eventos',
            'Financeiro',
            'Biblioteca',
          ].includes(group);
          const expanded = headerless || expandedGroups.includes(group);
          const groupId = `navigation-group-${navigationGroups.indexOf(group)}`;
          return (
            <Box key={group}>
              {!headerless && (
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
                  sx={{ pl: headerless ? 0 : 1 }}
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
                          backgroundColor: 'action.selected',
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
  const { user } = useAuth();
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
            Painel de A Ponte
          </Typography>
          <Tooltip title="Notificações">
            <IconButton
              component={NavLink}
              to="/inbox"
              aria-label="Notificações"
            >
              <NotificationBell />
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
        <Box component="header">
          <Toolbar className="header-spacer" />
          {user && <PushPermissionBanner key={user.id} userId={user.id} />}
        </Box>
        <Container maxWidth="xl" className="dashboard-content">
          <Suspense fallback={<LinearProgress aria-label="Carregando tela" />}>
            {children ?? <Outlet />}
          </Suspense>
        </Container>
      </Box>
    </Box>
  );
}
