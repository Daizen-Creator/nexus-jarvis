import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SystemWindow } from './SystemWindow';
import { useSound } from '../hooks/useSound';
import { useCodeStore } from '../store/useCodeStore';
import { useConfigStore } from '../store/useConfigStore';
import { generate, parseCodeRequest } from '../engine/codegen';
import { extractPreview } from '../engine/preview';
import { LANGUAGES } from '../desktop/languages';
import { desktop } from '../desktop/bridge';

/**
 * Janela do gerador de código: prompt, streaming ao vivo, arquivo salvo e
 * saída da execução.
 */
export function CodePanel(): JSX.Element | null {
  const sound = useSound();
  const open = useCodeStore((s) => s.open);
  const busy = useCodeStore((s) => s.busy);
  const stream = useCodeStore((s) => s.stream);
  const result = useCodeStore((s) => s.result);
  const exec = useCodeStore((s) => s.exec);
  const executing = useCodeStore((s) => s.executing);
  const error = useCodeStore((s) => s.error);
  const language = useCodeStore((s) => s.language);
  const setOpen = useCodeStore((s) => s.setOpen);
  const setExec = useCodeStore((s) => s.setExec);
  const setExecuting = useCodeStore((s) => s.setExecuting);

  const allowExecute = useConfigStore((s) => s.config.ai.allowExecute);
  const model = useConfigStore((s) => s.config.ai.model);

  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const streamRef = useRef<HTMLPreElement | null>(null);

  // Acompanha o texto chegando.
  useEffect(() => {
    const node = streamRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [stream]);

  const submit = useCallback(() => {
    const parsed = parseCodeRequest(draft);
    if (!parsed) return;
    setDraft('');
    void generate(parsed);
  }, [draft]);

  const copy = useCallback(() => {
    const code = result?.code ?? extractPreview(stream);
    if (code.length === 0) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [result, stream]);

  const runNow = useCallback(() => {
    const bridge = desktop();
    if (!bridge || !result?.filePath) return;
    setExecuting(true);
    void bridge.aiExecute(result.filePath, result.language).then((r) => {
      setExecuting(false);
      setExec(r);
    });
  }, [result, setExec, setExecuting]);

  if (!open) return null;

  const shown = result?.code ?? extractPreview(stream);
  const languageLabel = LANGUAGES.find((l) => l.id === language)?.label ?? language;
  const runnable = LANGUAGES.find((l) => l.id === (result?.language ?? language))?.run !== null;

  return (
    <div className="fixed inset-0 z-[57] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6">
      <div className="flex h-full w-full max-w-5xl flex-col">
        <SystemWindow
          title="Gerador de código"
          badge="{ }"
          meta={model}
          onClose={() => setOpen(false)}
          className="flex min-h-0 flex-1 flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col gap-3"
        >
          {/* Entrada */}
          <div className="flex shrink-0 gap-2">
            <input
              className="nx-input nx-clip-sm flex-1 font-mono text-[0.78rem]"
              value={draft}
              placeholder="em python, uma função que valida CPF"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
              disabled={busy}
              aria-label="Descreva o que programar"
            />
            <button
              type="button"
              className="nx-btn nx-clip-btn !text-[0.6rem]"
              onClick={submit}
              onMouseEnter={sound.hover}
              disabled={busy || draft.trim().length < 3}
            >
              {busy ? 'GERANDO...' : 'GERAR'}
            </button>
          </div>

          <p className="shrink-0 font-mono text-[0.62rem] text-ice/30">
            Linguagens: {LANGUAGES.map((l) => l.label).join(' · ')}
          </p>

          {/* Código */}
          <div className="nx-panel nx-clip-sm relative flex min-h-0 flex-1 flex-col">
            <div className="nx-titlebar flex shrink-0 items-center gap-2 px-3 py-1.5">
              <span className="font-display text-[0.58rem] font-bold uppercase tracking-[0.3em] text-cyan">
                {languageLabel}
              </span>
              {busy ? (
                <span className="font-mono text-[0.6rem] text-ice/40">
                  <span className="animate-blink">▋</span> escrevendo
                </span>
              ) : null}
              <span className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="border border-blue/40 px-2 py-0.5 font-mono text-[0.58rem] text-cyan transition-colors duration-200 hover:bg-blue/15 disabled:opacity-30"
                  onClick={copy}
                  disabled={shown.length === 0}
                >
                  {copied ? 'COPIADO' : 'COPIAR'}
                </button>
                {result?.filePath && runnable ? (
                  <button
                    type="button"
                    className="border border-gold/50 px-2 py-0.5 font-mono text-[0.58rem] text-gold transition-colors duration-200 hover:bg-gold/15 disabled:opacity-30"
                    onClick={runNow}
                    disabled={executing || !allowExecute}
                    title={allowExecute ? undefined : 'Ative a execução em Configuração → IA'}
                  >
                    {executing ? 'RODANDO...' : 'EXECUTAR'}
                  </button>
                ) : null}
              </span>
            </div>

            <pre
              ref={streamRef}
              className="nx-scroll min-h-0 flex-1 overflow-auto whitespace-pre px-3 py-2 font-mono text-[0.72rem] leading-relaxed text-ice/85"
            >
              {shown.length > 0 ? (
                shown
              ) : (
                <span className="text-ice/25">
                  O código aparece aqui conforme o modelo escreve.
                </span>
              )}
            </pre>
          </div>

          {/* Arquivo e erros */}
          <AnimatePresence>
            {result?.filePath ? (
              <motion.p
                key="file"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="shrink-0 break-all font-mono text-[0.66rem] text-success"
              >
                salvo em {result.filePath}
              </motion.p>
            ) : null}

            {error ? (
              <motion.p
                key="err"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="shrink-0 font-mono text-[0.68rem] text-danger"
                role="alert"
              >
                {error}
              </motion.p>
            ) : null}

            {exec ? (
              <motion.div
                key="exec"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`nx-panel nx-clip-sm max-h-40 shrink-0 overflow-auto p-2 ${
                  exec.ok ? '' : 'border-danger/50'
                }`}
              >
                <p className="nx-label mb-1">
                  Saída {exec.ok ? '' : `(código ${exec.exitCode ?? '?'})`}
                </p>
                {exec.stdout ? (
                  <pre className="whitespace-pre-wrap font-mono text-[0.68rem] text-ice/80">
                    {exec.stdout}
                  </pre>
                ) : null}
                {exec.stderr ? (
                  <pre className="whitespace-pre-wrap font-mono text-[0.68rem] text-danger/85">
                    {exec.stderr}
                  </pre>
                ) : null}
                {!exec.stdout && !exec.stderr ? (
                  <p className="font-mono text-[0.68rem] text-ice/35">(sem saída)</p>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!allowExecute ? (
            <p className="shrink-0 font-mono text-[0.62rem] leading-snug text-ice/30">
              Execução automática desligada. Leia o código antes de rodar — ative em Configuração
              → IA se quiser o botão EXECUTAR.
            </p>
          ) : null}
        </SystemWindow>
      </div>
    </div>
  );
}
