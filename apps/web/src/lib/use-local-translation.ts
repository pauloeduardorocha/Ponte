import { useCallback, useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    LocalAudioCodec?: {
      decode(packet: Uint8Array): { samples: Int16Array; sampleRate: number };
    };
  }
}
interface TranslationMessage {
  state?: string;
  snapshot?: string;
  reset?: boolean;
  content?: {
    interrupted?: boolean;
    outputTranscription?: { text?: string };
    turnComplete?: boolean;
  };
}
export function useLocalTranslation(audienceUrl: string | null) {
  const [text, setText] = useState(''),
    [status, setStatus] = useState('Pronto para conectar'),
    [error, setError] = useState('');
  const [connected, setConnected] = useState(false),
    [muted, setMuted] = useState(false);
  const runtime = useRef({
    socket: null as WebSocket | null,
    context: null as AudioContext | null,
    nodes: new Set<AudioBufferSourceNode>(),
    nextTime: 0,
    generation: 0,
    muted: false,
  });
  const clearAudio = useCallback(() => {
    for (const node of runtime.current.nodes) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
    }
    runtime.current.nodes.clear();
    runtime.current.nextTime = 0;
  }, []);
  const disconnect = useCallback(() => {
    runtime.current.generation++;
    runtime.current.socket?.close();
    runtime.current.socket = null;
    clearAudio();
    void runtime.current.context?.close().catch(() => undefined);
    runtime.current.context = null;
  }, [clearAudio]);
  useEffect(() => {
    setConnected(false);
    setText('');
    setStatus('Pronto para conectar');
    return () => disconnect();
  }, [audienceUrl, disconnect]);
  const connect = useCallback(async () => {
    if (!audienceUrl) return;
    disconnect();
    setError('');
    setStatus('Conectando ao computador da igreja…');
    setConnected(false);
    const generation = runtime.current.generation;
    try {
      const url = new URL(audienceUrl);
      if (
        url.protocol !== 'http:' ||
        !/^\/listen\/[a-f0-9]{24}$/.test(url.pathname)
      )
        throw new Error('Endereço da transmissão inválido.');
      runtime.current.context = new AudioContext();
      await runtime.current.context.resume();
      const moduleUrl = '/translation-codec.js';
      await import(/* @vite-ignore */ moduleUrl);
      if (generation !== runtime.current.generation) return;
      url.protocol = 'ws:';
      url.pathname = url.pathname.replace('/listen/', '/audience-ws/');
      const socket = new WebSocket(url.href);
      runtime.current.socket = socket;
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => {
        if (generation === runtime.current.generation) {
          setConnected(true);
          setStatus('Conectado à igreja');
        }
      };
      socket.onmessage = (event) => {
        if (generation !== runtime.current.generation) return;
        if (event.data instanceof ArrayBuffer) {
          if (runtime.current.muted) return;
          try {
            const decoded = window.LocalAudioCodec!.decode(
                new Uint8Array(event.data),
              ),
              context = runtime.current.context;
            if (!context || context.state !== 'running') return;
            const buffer = context.createBuffer(
                1,
                decoded.samples.length,
                decoded.sampleRate,
              ),
              channel = buffer.getChannelData(0);
            for (let i = 0; i < channel.length; i++)
              channel[i] = decoded.samples[i]! / 32768;
            if (runtime.current.nextTime - context.currentTime > 3)
              clearAudio();
            const node = context.createBufferSource();
            node.buffer = buffer;
            node.connect(context.destination);
            runtime.current.nextTime = Math.max(
              context.currentTime + 0.03,
              runtime.current.nextTime,
            );
            node.start(runtime.current.nextTime);
            runtime.current.nextTime += buffer.duration;
            runtime.current.nodes.add(node);
            node.onended = () => runtime.current.nodes.delete(node);
          } catch {
            setError(
              'Um bloco de áudio não pôde ser reproduzido. Aguardando o próximo.',
            );
          }
          return;
        }
        const message = JSON.parse(event.data as string) as TranslationMessage;
        if (message.state) {
          setStatus(
            message.state === 'live'
              ? 'Tradução ao vivo'
              : 'Aguardando o apresentador',
          );
          if (message.state !== 'live') clearAudio();
        }
        if (message.reset) {
          setText('');
          clearAudio();
        }
        if (typeof message.snapshot === 'string') setText(message.snapshot);
        if (message.content?.interrupted) clearAudio();
        const addition =
          (message.content?.outputTranscription?.text ?? '') +
          (message.content?.turnComplete ? '\n\n' : '');
        if (addition) setText((current) => (current + addition).slice(-50000));
      };
      socket.onclose = () => {
        if (generation === runtime.current.generation) {
          setConnected(false);
          setStatus('Desconectado');
          clearAudio();
          setError(
            'Confira o Wi-Fi e permita o acesso à rede local. Se o navegador bloquear, use Abrir página local.',
          );
        }
      };
      socket.onerror = () => socket.close();
    } catch {
      if (generation === runtime.current.generation) {
        disconnect();
        setStatus('Não foi possível conectar');
        setError(
          'Conecte-se ao Wi-Fi da igreja e permita acesso à rede local. Você também pode usar Abrir página local.',
        );
      }
    }
  }, [audienceUrl, clearAudio, disconnect]);
  const toggleMute = useCallback(() => {
    runtime.current.muted = !runtime.current.muted;
    setMuted(runtime.current.muted);
    if (runtime.current.muted) clearAudio();
  }, [clearAudio]);
  return { text, status, error, connected, muted, connect, toggleMute };
}
