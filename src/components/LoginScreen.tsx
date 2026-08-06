import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SystemWindow } from './SystemWindow';
import { useSound } from '../hooks/useSound';
import { sphereController } from '../hooks/useSphere';
import { usePlayerStore } from '../store/usePlayerStore';
import { useSystemStore } from '../store/useSystemStore';
import { useConfigStore } from '../store/useConfigStore';
import { speech } from '../engine/SpeechEngine';

export interface LoginScreenProps {
  onAuthenticated: () => void;
}

export function LoginScreen({ onAuthenticated }: LoginScreenProps): JSX.Element {
  const sound = useSound();
  const login = usePlayerStore((s) => s.login);
  const visible = useSystemStore((s) => s.loginVisible);
  const setVisible = useSystemStore((s) => s.setLoginVisible);
  const remember = useSystemStore((s) => s.remember);
  const setRemember = useSystemStore((s) => s.setRemember);
  const voiceEnabled = useSystemStore((s) => s.voiceEnabled);
  const profile = useConfigStore((s) => s.config.profile);
  const hashPassword = useConfigStore((s) => s.hashPassword);

  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [denied, setDenied] = useState(false);
  const [shaking, setShaking] = useState(false);
  const userInputRef = useRef<HTMLInputElement | null>(null);
  const deniedTimerRef = useRef<number | null>(null);

  const say = useCallback(
    (text: string) => {
      if (voiceEnabled) speech.speak(text);
    },
    [voiceEnabled],
  );

  useEffect(() => {
    if (visible) userInputRef.current?.focus();
  }, [visible]);

  useEffect(
    () => () => {
      if (deniedTimerRef.current !== null) window.clearTimeout(deniedTimerRef.current);
    },
    [],
  );

  const shake = useCallback(() => {
    setShaking(true);
    window.setTimeout(() => setShaking(false), 460);
  }, []);

  const deny = useCallback(
    (message: string) => {
      setDenied(true);
      shake();
      sound.play('error');
      sphereController.setState('alert');
      say(message);
      if (deniedTimerRef.current !== null) window.clearTimeout(deniedTimerRef.current);
      deniedTimerRef.current = window.setTimeout(() => {
        setDenied(false);
        if (sphereController.getState() === 'alert') sphereController.setState('idle');
      }, 2200);
    },
    [shake, sound, say],
  );

  const handleAccept = useCallback(() => {
    sound.unlock();
    const name = user.trim();
    const expected = profile.userName.trim();

    if (name.localeCompare(expected, 'pt-BR', { sensitivity: 'base' }) !== 0) {
      deny('Acesso negado. Identificação inválida, Senhor.');
      return;
    }

    // A senha só existe como SHA-256 — nem a configuração guarda o texto puro.
    void hashPassword(pass).then((digest) => {
      if (digest !== profile.passwordHash) {
        deny('Acesso negado. Credencial incorreta.');
        return;
      }

      sound.play('confirm');
      sphereController.setState('processing');
      sphereController.pulse(1.4);
      login(expected);
      say(`Autenticação concluída. Bem-vindo, ${expected}.`);
      window.setTimeout(() => {
        sphereController.setState('idle');
        onAuthenticated();
      }, 620);
    });
  }, [user, pass, profile, hashPassword, deny, login, onAuthenticated, sound, say]);

  const handleDecline = useCallback(() => {
    sound.unlock();
    shake();
    sound.play('error');
    say('Como quiser, Senhor.');
    window.setTimeout(() => setVisible(false), 520);
  }, [shake, sound, say, setVisible]);

  const handleReopen = useCallback(() => {
    sound.unlock();
    sound.play('notify');
    setVisible(true);
  }, [sound, setVisible]);

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {visible ? (
          <motion.div
            key="login-window"
            className="pointer-events-auto w-full max-w-md"
            initial={{ opacity: 0, scale: 0.94, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.96, filter: 'blur(8px)', transition: { duration: 0.28 } }}
            transition={{ duration: 0.48, ease: [0.2, 0.8, 0.2, 1] }}
            onAnimationStart={() => sound.play('notify')}
          >
            <div className={shaking ? 'nx-shake' : undefined}>
              <SystemWindow
                title="Notificação"
                badge="!"
                meta="AUTH-01"
                variant={denied ? 'alert' : 'default'}
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAccept();
                  }}
                  className="space-y-5"
                >
                  <div className="space-y-1 text-center">
                    <p className="font-display text-sm tracking-[0.18em] text-ice nx-glow">
                      Autenticação requerida.
                    </p>
                    <p className="font-mono text-xs tracking-[0.14em] text-ice/60">
                      Identifique-se, Jogador.
                    </p>
                  </div>

                  <AnimatePresence>
                    {denied ? (
                      <motion.p
                        key="denied"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="nx-glitch text-center font-display text-sm font-bold tracking-[0.3em] text-danger"
                        role="alert"
                      >
                        ACESSO NEGADO
                      </motion.p>
                    ) : null}
                  </AnimatePresence>

                  <div className="space-y-3">
                    <label className="block">
                      <span className="nx-label mb-1.5 block">Usuário</span>
                      <input
                        ref={userInputRef}
                        type="text"
                        name="nexus-user"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={20}
                        value={user}
                        onChange={(e) => setUser(e.target.value)}
                        onKeyDown={() => sound.key()}
                        className={`nx-input nx-clip-sm font-mono ${denied ? 'border-danger' : ''}`}
                        placeholder="_"
                        aria-invalid={denied}
                      />
                    </label>

                    <label className="block">
                      <span className="nx-label mb-1.5 block">Senha</span>
                      <input
                        type="password"
                        name="nexus-pass"
                        autoComplete="off"
                        maxLength={32}
                        value={pass}
                        onChange={(e) => setPass(e.target.value)}
                        onKeyDown={() => sound.key()}
                        className={`nx-input nx-clip-sm font-mono tracking-[0.3em] ${denied ? 'border-danger' : ''}`}
                        placeholder="•••"
                        aria-invalid={denied}
                      />
                    </label>
                  </div>

                  {/* Checkbox customizado com animação de preenchimento */}
                  <button
                    type="button"
                    onClick={() => {
                      setRemember(!remember);
                      sound.play('hover');
                    }}
                    className="flex min-h-[44px] items-center gap-3 text-left"
                    role="checkbox"
                    aria-checked={remember}
                  >
                    <span className="relative grid h-5 w-5 place-items-center border border-blue/60">
                      <motion.span
                        className="absolute inset-[3px] bg-cyan"
                        initial={false}
                        animate={{
                          scale: remember ? 1 : 0,
                          opacity: remember ? 1 : 0,
                        }}
                        transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                        style={{ boxShadow: '0 0 10px rgb(var(--c-cyan) / 0.8)' }}
                      />
                    </span>
                    <span className="font-mono text-xs tracking-[0.14em] text-ice/65">
                      Lembrar-me
                    </span>
                  </button>

                  <div className="flex gap-3 pt-1">
                    <button
                      type="submit"
                      className="nx-btn nx-clip-btn flex-1"
                      onMouseEnter={sound.hover}
                    >
                      SIM
                    </button>
                    <button
                      type="button"
                      onClick={handleDecline}
                      className="nx-btn nx-btn--ghost nx-clip-btn flex-1"
                      onMouseEnter={sound.hover}
                    >
                      NÃO
                    </button>
                  </div>
                </form>
              </SystemWindow>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="reopen"
            type="button"
            onClick={handleReopen}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="nx-btn nx-clip-btn pointer-events-auto"
            onMouseEnter={sound.hover}
          >
            REABRIR NOTIFICAÇÃO
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
