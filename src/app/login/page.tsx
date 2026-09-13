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
  const [passwordState, passwordAction, passwordPending] = useActionState(signInWithPasswordAction, initialState)
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpWithPasswordAction, initialState)
  const [magicLinkState, magicLinkAction, magicLinkPending] = useActionState(signInWithMagicLinkAction, initialState)
  const [googleState, googleAction, googlePending] = useActionState(signInWithGoogleAction, initialState)

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
          <form className="card">
            {(passwordState.error || signUpState.error) && (
              <div className="alert alert-error" role="alert">{passwordState.error ?? signUpState.error}</div>
            )}
            {signUpState.message && <div className="alert alert-info" role="status">{signUpState.message}</div>}

            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" name="password" type="password" required minLength={6} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" formAction={passwordAction} disabled={passwordPending} className="btn btn-primary" style={{ flex: 1 }}>
                {passwordPending ? 'Entrando…' : 'Entrar'}
              </button>
              <button type="submit" formAction={signUpAction} disabled={signUpPending} className="btn btn-secondary" style={{ flex: 1 }}>
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
              <input id="magic-email" name="email" type="email" required />
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
