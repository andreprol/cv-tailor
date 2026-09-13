'use client'

import { useActionState, useState } from 'react'
import {
  signInWithPasswordAction,
  signUpWithPasswordAction,
  signInWithMagicLinkAction,
  signInWithGoogleAction,
  type AuthActionState,
} from '@/app/actions/auth'

const initialState: AuthActionState = { error: null, message: null }

export default function LoginPage() {
  const [showMagicLink, setShowMagicLink] = useState(false)
  const [lastAction, setLastAction] = useState<'signin' | 'signup' | null>(null)
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPasswordAction, initialState)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpWithPasswordAction, initialState)
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(signInWithMagicLinkAction, initialState)
  const [googleState, googleAction, googlePending] = useActionState(signInWithGoogleAction, initialState)

  const activeState = lastAction === 'signup' ? signUpState : lastAction === 'signin' ? passwordState : initialState
  const anyPasswordPending = passwordPending || signUpPending

  return (
    <main className="container">
      <div className="auth-form">
        <h1 style={{ textAlign: 'center' }}>Entrar no CV Tailor</h1>

        <form action={googleAction} className="card">
          {googleState.error && <div className="alert alert-error" role="alert">{googleState.error}</div>}
          <button type="submit" disabled={googlePending} className="btn btn-secondary btn-block">
            {!googlePending && (
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.87 2.68-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58Z" />
              </svg>
            )}
            {googlePending ? 'Redirecionando…' : 'Continuar com Google'}
          </button>
        </form>

        <div className="auth-divider">ou</div>

        {!showMagicLink ? (
          <form action={passwordAction} className="card">
            {activeState.error && <div className="alert alert-error" role="alert">{activeState.error}</div>}
            {activeState.message && <div className="alert alert-info" role="status">{activeState.message}</div>}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required minLength={6} />
              <span className="hint">Minimo 6 caracteres.</span>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                onClick={() => setLastAction('signin')}
                disabled={anyPasswordPending}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                {passwordPending ? 'Entrando…' : 'Entrar'}
              </button>
              <button
                type="submit"
                formAction={signUpAction}
                onClick={() => setLastAction('signup')}
                disabled={anyPasswordPending}
                className="btn btn-secondary"
                style={{ flex: 1 }}
              >
                {signUpPending ? 'Criando…' : 'Criar conta'}
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => setShowMagicLink(true)} className="link-button">
                Prefiro receber um link mágico por email
              </button>
            </div>
          </form>
        ) : (
          <form action={magicLinkAction} className="card">
            {magicLinkState.error && <div className="alert alert-error" role="alert">{magicLinkState.error}</div>}
            {magicLinkState.message && <div className="alert alert-info" role="status">{magicLinkState.message}</div>}

            <div className="field">
              <label htmlFor="magic-email">Email</label>
              <input id="magic-email" name="email" type="email" autoComplete="email" required />
            </div>
            <button type="submit" disabled={magicLinkPending} className="btn btn-primary btn-block">
              {magicLinkPending ? 'Enviando…' : 'Enviar link mágico'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => setShowMagicLink(false)} className="link-button">
                Prefiro usar senha
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
