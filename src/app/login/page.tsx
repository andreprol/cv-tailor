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
