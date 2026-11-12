import { t as translate, useLocale } from '../i18n';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
} from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';
import type { ReactNode } from 'react';
import { PwaInstallContext } from './pwa-install-context';
import { applyPwaUpdate } from '../lib/pwa-update';
import {
  getAvailableVersion,
  subscribeToAppUpdate,
  UPDATE_MESSAGE,
} from '../lib/app-update';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const INSTALL_DISMISSED_KEY = 'ponte:pwa-install-dismissed';

interface RelatedApp {
  platform: string;
  url?: string;
  id?: string;
}

export function PwaControls({ children }: { children?: ReactNode }) {
  useLocale();
  const availableVersion = useSyncExternalStore(
    subscribeToAppUpdate,
    getAvailableVersion,
  );
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(
    null,
  );
  const [instructions, setInstructions] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(() => {
    try {
      return localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const updateInProgress = useRef(false);
  const [installed, setInstalled] = useState(
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    // Reloading is handled after explicit acceptance, including cross-tab updates.
    onNeedReload: () => undefined,
  });

  async function update() {
    if (updateInProgress.current) return;
    updateInProgress.current = true;
    setUpdating(true);
    setUpdateError(null);
    try {
      await applyPwaUpdate(undefined, !!availableVersion);
    } catch (error) {
      setUpdateError(
        error instanceof Error
          ? error.message
          : translate('Não foi possível atualizar. Tente novamente.'),
      );
    } finally {
      updateInProgress.current = false;
      setUpdating(false);
    }
  }

  useEffect(() => {
    let active = true;
    const relatedNavigator = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
    };
    async function detectInstallation() {
      try {
        const apps = await relatedNavigator.getInstalledRelatedApps?.();
        const manifestUrl = new URL(
          '/manifest.webmanifest',
          window.location.origin,
        ).href;
        if (
          active &&
          apps?.some(
            (app) => app.platform === 'webapp' && app.url === manifestUrl,
          )
        ) {
          setInstalled(true);
          setInstallPrompt(null);
        }
      } catch {
        // Unsupported or denied detection must not prevent manual installation.
      }
    }
    void detectInstallation();
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      active = false;
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismissInstallation() {
    setInstallDismissed(true);
    setInstructions(false);
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    } catch {
      // Keep the dismissal for this session when storage is unavailable.
    }
  }

  async function install() {
    if (!installPrompt) {
      setInstructions(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

  const installButton =
    !installed && !installDismissed && (installPrompt || ios) ? (
      <Button
        fullWidth
        variant="contained"
        onClick={() => void install()}
        sx={{
          mb: 2,
          bgcolor: '#d91017',
          color: '#ffffff',
          '&:hover': { bgcolor: '#ad0d13' },
        }}
      >
        {translate('Instalar aplicação')}
      </Button>
    ) : null;

  return (
    <PwaInstallContext.Provider value={installButton}>
      {children}
      <Dialog open={instructions} onClose={() => setInstructions(false)}>
        <DialogTitle>{translate('Instalar no iPhone ou iPad')}</DialogTitle>
        <DialogContent>
          {translate(
            'Abra esta página no Safari, toque em Partilhar e escolha “Adicionar ao ecrã principal”. Se aparecer a opção “Abrir como aplicação”, mantenha-a ativada e toque em Adicionar.',
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={dismissInstallation}>
            {translate('Já instalei / Não mostrar novamente')}
          </Button>
          <Button onClick={() => setInstructions(false)}>
            {translate('Entendido')}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={
          needRefresh ||
          (!!availableVersion && availableVersion !== dismissedVersion)
        }
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          severity={updateError ? 'error' : 'info'}
          onClose={
            updating
              ? undefined
              : () => {
                  setNeedRefresh(false);
                  setDismissedVersion(availableVersion);
                }
          }
          action={
            <Button
              color="inherit"
              disabled={updating}
              onClick={() => void update()}
            >
              {updating
                ? translate('A atualizar…')
                : updateError
                  ? translate('Tentar novamente')
                  : translate('Atualizar')}
            </Button>
          }
        >
          {updateError ??
            (updating
              ? translate('A aplicar a nova versão…')
              : availableVersion
                ? translate(UPDATE_MESSAGE)
                : translate(
                    'Nova versão disponível. Guarde as alterações antes de atualizar.',
                  ))}
        </Alert>
      </Snackbar>
    </PwaInstallContext.Provider>
  );
}
