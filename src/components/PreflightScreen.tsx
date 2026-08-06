import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SystemWindow } from './SystemWindow';
import { useSound } from '../hooks/useSound';
import { desktop } from '../desktop/bridge';
import type { Requirement } from '../types/desktop';

export interface PreflightScreenProps {
  onComplete: () => void;
}

const STATUS_STYLE: Record<Requirement['status'], { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-success', text: 'text-success', label: 'PRONTO' },
  missing: { dot: 'bg-danger', text: 'text-danger', label: 'FALTANDO' },
  checking: { dot: 'bg-cyan animate-pulse', text: 'text-cyan', label: 'VERIFICANDO' },
  error: { dot: 'bg-gold', text: 'text-gold', label: 'BLOQUEADO' },
};

/**
 * Verificação de requisitos no estilo "janela do Sistema" antes de entrar.
 *
 * Confere Python, dependências de voz, modelo Vosk, Ollama e os modelos de IA.
 * O que estiver faltando pode ser instalado/atualizado ali mesmo, com um botão
 * por item, sem sair do NEXUS.
 */
export function PreflightScreen({ onComplete }: PreflightScreenProps): JSX.Element {
  const sound = useSound();
  const bridge = desktop();

  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(true);
  const doneRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setChecking(true);
    const result = await bridge.checkRequirements();
    setReqs(result);
    setChecking(false);
  }, [bridge]);

  useEffect(() => {
    void refresh();
    if (!bridge) return undefined;
    const offLog = bridge.onPreflightLog(({ id, line }) =>
      setLogs((s) => ({ ...s, [id]: line })),
    );
    const offProg = bridge.onPreflightProgress(({ id, pct }) =>
      setProgress((s) => ({ ...s, [id]: pct })),
    );
    return () => {
      offLog();
      offProg();
    };
  }, [bridge, refresh]);

  const fix = useCallback(
    async (id: string) => {
      if (!bridge) return;
      setBusy(id);
      sound.play('notify');
      await bridge.fixRequirement(id);
      setBusy(null);
      setProgress((s) => ({ ...s, [id]: 0 }));
      await refresh();
    },
    [bridge, refresh, sound],
  );

  const enter = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onComplete();
  }, [onComplete]);

  // Blocos obrigatórios (não-opcionais) faltando impedem a entrada.
  const blocking = reqs.filter((r) => !r.optional && r.status !== 'ok');
  const allReady = reqs.length > 0 && reqs.every((r) => r.status === 'ok');

  // Tudo pronto e ninguém mexendo: entra sozinho após um instante. Se algo
  // falta (mesmo opcional), pausa para você decidir instalar ou seguir.
  useEffect(() => {
    if (!allReady || busy !== null) return undefined;
    const timer = window.setTimeout(enter, 1400);
    return () => window.clearTimeout(timer);
  }, [allReady, busy, enter]);

  return (
    <motion.div
      className="fixed inset-0 z-[65] flex items-center justify-center bg-bg/95 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-full max-w-2xl">
        <SystemWindow title="Verificação do Sistema" badge="!" meta="PRE-FLIGHT">
          <p className="mb-4 font-mono text-[0.7rem] leading-snug text-ice/55">
            Conferindo os requisitos antes de acordar o núcleo. O que estiver faltando pode ser
            instalado agora, sem sair do NEXUS.
          </p>

          <ul className="space-y-2">
            {reqs.map((req) => {
              const style = STATUS_STYLE[req.status];
              const pct = progress[req.id] ?? 0;
              return (
                <li key={req.id} className="border-l border-blue/20 pl-3">
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true" className={`h-2 w-2 shrink-0 rotate-45 ${style.dot}`} />
                    <span className="flex-1 font-display text-[0.68rem] font-bold uppercase tracking-[0.14em] text-ice/85">
                      {req.label}
                      {req.optional ? <span className="ml-2 text-ice/25">(opcional)</span> : null}
                    </span>
                    <span className={`font-mono text-[0.6rem] ${style.text}`}>{style.label}</span>
                    {req.status !== 'ok' && req.fixable ? (
                      <button
                        type="button"
                        onMouseEnter={sound.hover}
                        onClick={() => void fix(req.id)}
                        disabled={busy !== null}
                        className="nx-clip-btn border border-cyan/60 px-2 py-1 font-mono text-[0.56rem] text-cyan transition-colors hover:bg-blue/15 disabled:opacity-30"
                      >
                        {busy === req.id ? (pct > 0 ? `${pct.toFixed(0)}%` : '...') : 'INSTALAR'}
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 break-all font-mono text-[0.6rem] text-ice/35">
                    {busy === req.id && logs[req.id] ? logs[req.id] : req.detail}
                  </p>
                </li>
              );
            })}
            {checking && reqs.length === 0 ? (
              <li className="font-mono text-[0.68rem] text-cyan">Verificando...</li>
            ) : null}
          </ul>

          <div className="mt-5 flex items-center gap-3 border-t border-blue/15 pt-4">
            <button
              type="button"
              className="nx-btn nx-clip-btn !text-[0.6rem]"
              onClick={() => void refresh()}
              disabled={busy !== null}
            >
              REVERIFICAR
            </button>

            <span className="ml-auto flex items-center gap-2">
              {blocking.length > 0 ? (
                <span className="font-mono text-[0.62rem] text-danger">
                  {blocking.length} requisito(s) essencial(is) faltando
                </span>
              ) : allReady ? (
                <span className="font-mono text-[0.62rem] text-success">tudo pronto</span>
              ) : null}
              <button
                type="button"
                className="nx-btn nx-clip-btn !text-[0.62rem]"
                onClick={enter}
                onMouseEnter={sound.hover}
              >
                {blocking.length > 0 ? 'ENTRAR MESMO ASSIM' : 'ENTRAR'}
              </button>
            </span>
          </div>
        </SystemWindow>
      </div>
    </motion.div>
  );
}
