import { useState, type ReactNode } from 'react';
import {
  AppBar,
  Avatar,
  Box,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
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
  LogoutRounded,
  ManageAccountsRounded,
  MenuRounded,
  NotificationsNoneRounded,
  PeopleAltRounded,
  MenuBookRounded,
} from '@mui/icons-material';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { initials } from '../lib/format';
import type { Permission } from '../lib/types';

const sidebarWidth = 264;

interface NavigationItem {
  label: string;
  to: string;
  icon: typeof DashboardRounded;
  permission?: Permission;
  permissionPrefix?: 'LIBRARY_';
}

const navigation: NavigationItem[] = [
  { label: 'Visão geral', to: '/', icon: DashboardRounded },
  {
    label: 'Membros',
    to: '/members',
    icon: PeopleAltRounded,
    permission: 'MEMBER_READ',
  },
  { label: 'Eventos', to: '/events', icon: CalendarMonthRounded },
  {
    label: 'Biblioteca',
    to: '/library',
    icon: MenuBookRounded,
    permissionPrefix: 'LIBRARY_',
  },
  {
    label: 'Financeiro',
    to: '/finance',
    icon: AccountBalanceRounded,
    permission: 'FINANCE_TRANSACTION_READ',
  },
  {
    label: 'Usuários',
    to: '/users',
    icon: AdminPanelSettingsRounded,
    permission: 'USER_READ',
  },
];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, hasPermission } = useAuth();
  const items = navigation.filter(({ permissionPrefix, permission }) =>
    permissionPrefix
      ? user?.permissions.some((code) => code.startsWith(permissionPrefix))
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

      <Typography className="sidebar-label">MENU PRINCIPAL</Typography>
      <List className="navigation-list" disablePadding>
        {items.map(({ label, to, icon: Icon }) => (
          <ListItemButton
            key={to}
            component={NavLink}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className="navigation-link"
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
            <IconButton aria-label="Notificações">
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
          {children ?? <Outlet />}
        </Container>
      </Box>
    </Box>
  );
}
