(() => {
  const callbacks = [], pending = [];
  const token = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  let authenticated = false;
  let socket, delay = 500, stopPending = false;
  const notify = message => callbacks.forEach(callback => callback(message));
  let onlinePending = false, monitorChannel = null;
  function forwardOnline() {
    onlinePending = true;
    if (authenticated && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: 'network-online' }));
      onlinePending = false;
    }
  }
  window.addEventListener('online', forwardOnline);
  function connect() {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/presenter-ws`);
    socket.onopen = () => socket.send(JSON.stringify({ token, canResume: true, monitorChannel }));
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.authenticated) {
        authenticated = true;
        delay = 500;
        if (stopPending) {
          socket.send(JSON.stringify({ action: 'stop' }));
          stopPending = false;
          onlinePending = false;
        } else if (onlinePending) forwardOnline();
        for (const resolve of pending.splice(0)) resolve();
      }
      notify(message);
    };
    socket.onclose = ({ code }) => {
      authenticated = false;
      for (const resolve of pending.splice(0)) resolve();
      if (code === 1008) {
        notify({ error: 'Acesso ao apresentador recusado. Reabra o aplicativo.' });
        return;
      }
      notify({ reconnecting: true });
      setTimeout(connect, delay);
      delay = Math.min(delay * 2, 10000);
    };
  }
  connect();
  window.translator = {
    startService: async (key, configuration) => {
      if (!authenticated && socket.readyState < WebSocket.CLOSING) await new Promise(resolve => pending.push(resolve));
      if (!authenticated) throw Error('Página sem autorização. Reabra o aplicativo.');
      socket.send(JSON.stringify({ action: 'start-service', key, configuration }));
    },
    monitor: id => {
      monitorChannel = id;
      if (authenticated) socket.send(JSON.stringify({ action: 'monitor', channelId: id }));
    },
    microphone: lost => {
      if (authenticated) socket.send(JSON.stringify({ action: 'microphone', lost }));
    },
    publishService: () => { if (authenticated) socket.send(JSON.stringify({ action: 'publish-service' })); },
    start: async key => {
      if (!authenticated && socket.readyState < WebSocket.CLOSING) await new Promise(resolve => pending.push(resolve));
      if (!authenticated) throw new Error('Página sem autorização. Use o link privado do apresentador.');
      socket.send(JSON.stringify({ action: 'start', key }));
    },
    stop: () => { if (authenticated) socket.send(JSON.stringify({ action: 'stop' })); else stopPending = true; },
    clear: channelId => { if (authenticated) socket.send(JSON.stringify({ action: 'clear', channelId })); },
    openChannel: languageCode => { if (authenticated) socket.send(JSON.stringify({ action: 'open-channel', languageCode })); },
    closeChannel: channelId => { if (authenticated) socket.send(JSON.stringify({ action: 'close-channel', channelId })); },
    retryChannel: channelId => { if (authenticated) socket.send(JSON.stringify({ action: 'retry-channel', channelId })); },
    configure: configuration => { if (authenticated) socket.send(JSON.stringify({ action: 'configure-ponte', configuration })); },
    publish: audienceUrl => { if (authenticated) socket.send(JSON.stringify({ action: 'publish', audienceUrl })); },
    unpublish: () => { if (authenticated) socket.send(JSON.stringify({ action: 'unpublish' })); },
    audio: data => { if (authenticated && socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 128000) socket.send(data); },
    listen: callback => callbacks.push(callback)
  };
})();
