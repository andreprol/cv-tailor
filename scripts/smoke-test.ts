// Post-deploy smoke test. Hits the deployed app over the network and fails
// loudly if it is not actually serving — a green Vercel build says the
// bundle compiled, not that the site answers.
//
// Everything checked here is reachable WITHOUT signing in, on purpose: a
// smoke test must never need the user's credentials, and the pages behind
// auth all sit under the same Next.js server that /login proves is alive.
//
//   npm run test:smoke
//   SMOKE_URL=https://<preview>.vercel.app npm run test:smoke

const BASE_URL = (process.env.SMOKE_URL ?? 'https://cv-tailor-amber.vercel.app').replace(/\/+$/, '')
const TIMEOUT_MS = 20000

interface Check {
  name: string
  run: () => Promise<string>
}

async function get(path: string, redirect: RequestRedirect = 'follow'): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, { redirect, signal: AbortSignal.timeout(TIMEOUT_MS) })
}

const checks: Check[] = [
  {
    name: 'GET /login responde 200',
    run: async () => {
      const response = await get('/login')
      if (response.status !== 200) throw new Error(`status ${response.status}`)
      return 'ok'
    },
  },
  {
    name: '/login renderiza os metodos de autenticacao (a pagina montou, nao e so um shell de erro)',
    run: async () => {
      const html = await (await get('/login')).text()
      // Matches the sign-in affordances rather than exact copy, so a wording
      // tweak doesn't fail the deploy while a blank/500 page still does.
      if (!/google/i.test(html)) throw new Error('nao encontrou o login do Google no HTML')
      if (!/e-?mail/i.test(html)) throw new Error('nao encontrou o campo de e-mail no HTML')
      return 'ok'
    },
  },
  {
    name: 'GET / protegido: responde 200 ou redireciona pra /login (nunca 5xx)',
    run: async () => {
      const response = await get('/', 'manual')
      if (response.status >= 500) throw new Error(`status ${response.status}`)
      const location = response.headers.get('location')
      return location ? `redirect -> ${location}` : `status ${response.status}`
    },
  },
]

async function main() {
  console.log(`smoke test: ${BASE_URL}\n`)
  let failed = 0

  for (const check of checks) {
    try {
      console.log(`  OK   ${check.name} (${await check.run()})`)
    } catch (error) {
      failed += 1
      console.error(`  FALHA ${check.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (failed > 0) {
    console.error(`\n${failed} verificacao(oes) falharam — considere rollback imediato.`)
    process.exit(1)
  }
  console.log('\ntodas as verificacoes passaram.')
}

main().catch((error) => {
  console.error('smoke test nao conseguiu rodar:', error)
  process.exit(1)
})
