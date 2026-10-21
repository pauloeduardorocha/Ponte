const UPDATE_TIMEOUT = 15_000;

function waitForState(worker: ServiceWorker, ready: () => boolean) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener('statechange', changed);
      window.clearTimeout(timeout);
    };
    const changed = () => {
      if (ready()) {
        cleanup();
        resolve();
      } else if (worker.state === 'redundant') {
        cleanup();
        reject(new Error('A atualização foi interrompida. Tente novamente.'));
      }
    };
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(
        new Error(
          'A atualização demorou mais que o esperado. Tente novamente.',
        ),
      );
    }, UPDATE_TIMEOUT);
    worker.addEventListener('statechange', changed);
    changed();
  });
}

/** Reload only after the user accepts and the replacement worker is active. */
export async function applyPwaUpdate(reload = () => window.location.reload()) {
  const registration =
    'serviceWorker' in navigator
      ? await navigator.serviceWorker.getRegistration()
      : undefined;

  // Another tab may already have activated the version advertised by the banner.
  if (!registration?.waiting && !registration?.installing) {
    reload();
    return;
  }

  const worker = registration.waiting ?? registration.installing!;
  if (worker.state === 'installing') {
    await waitForState(worker, () => worker.state !== 'installing');
  }
  if (worker.state === 'redundant') {
    throw new Error('A atualização foi interrompida. Tente novamente.');
  }

  // Observe activation directly: Workbox's controlling/isUpdate classification
  // can differ for workers installed by another tab or an earlier page visit.
  if (worker.state !== 'activated')
    worker.postMessage({ type: 'SKIP_WAITING' });
  await waitForState(worker, () => worker.state === 'activated');
  reload();
}
