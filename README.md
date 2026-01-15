# PSI BEST FRIEND (PBF)

App React (Vite) com Supabase (Auth + Postgres + RLS). Internamente os dados ficam isolados por `workspace_id`, mas o app foi simplificado para **1 login = 1 psicólogo**, sem telas de “Perfis”/convite/entrar por código.

## Configuração (local)

1) Crie um arquivo `.env.local` com:

- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`

Opcional:

- `VITE_SUPABASE_PERSIST_SESSION=1` (mantém logado entre reloads)
- `VITE_DEBUG_SUPABASE=1` (loga erros de RPC no console)
- `VITE_AUTH_REDIRECT_TO=https://<seu-site>.vercel.app` (força o link de confirmação/reset a voltar para esse domínio; útil para evitar links para localhost)

2) Rode o schema no Supabase SQL Editor:

- Arquivo: `supabase/schema.sql`

3) Suba o app:

- `npm install`
- `npm run dev`

## Deploy (Vercel)

1) Suba o projeto para um repositório Git (GitHub/GitLab/Bitbucket).

2) No Vercel, clique em **Add New → Project** e importe o repositório.

3) Em **Build & Output Settings** (geralmente o Vercel detecta automaticamente):

- Framework: **Vite**
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

4) Em **Environment Variables**, configure (mesmos nomes usados no Vite):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- (opcional) `VITE_SUPABASE_PERSIST_SESSION=1`
- (opcional) `VITE_AUTH_REDIRECT_TO=https://<seu-site>.vercel.app`

5) Deploy.

Notas:

- O arquivo `vercel.json` já inclui rewrite para SPA (equivalente ao `_redirects` do Netlify).
- O app **não** permite “login local” por padrão. Se as env vars do Supabase não estiverem configuradas no Vercel, você verá a mensagem de Supabase não configurado e não vai conseguir avançar.

## Supabase Auth (URLs)

Para signup/confirm/reset funcionarem no Vercel, configure em `Authentication → URL Configuration`:

- **Site URL**: seu domínio do Vercel (ex: `https://<seu-site>.vercel.app`)
- **Redirect URLs**: inclua
	- `https://<seu-site>.vercel.app/**`
	- `http://localhost:5173/**` (dev)

Se o email de confirmação estiver chegando com `localhost:3000` (ou outro localhost), isso é quase sempre porque o **Site URL** do Supabase está apontando para localhost.
Ajuste o Site URL para o domínio público do app e (opcionalmente) configure `VITE_AUTH_REDIRECT_TO` no Vercel para garantir.

Se o email estiver chegando com link do **Netlify**, quase sempre é porque:

- o **Site URL** do Supabase ainda está como `https://<seu-site>.netlify.app`; e/ou
- você deixou `VITE_AUTH_REDIRECT_TO` apontando para o Netlify nas env vars do build.

Checklist rápido de migração Netlify → Vercel (Auth):

- Troque o **Site URL** no Supabase para o domínio final do Vercel.
- Garanta que esse domínio esteja em **Redirect URLs**.
- No Vercel, ajuste `VITE_AUTH_REDIRECT_TO` para o domínio do Vercel (ou remova/ deixe vazio para usar `window.location.origin`).

---

## Deploy (Netlify) (legado)

No Netlify, as variáveis precisam existir no **build** (Vite injeta `import.meta.env.*` na build).

Em `Site settings → Build & deploy → Environment`, configure:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- (opcional) `VITE_SUPABASE_PERSIST_SESSION=1`

Importante:

- O app **não** permite “login local” por padrão. Se as env vars do Supabase não estiverem configuradas no Netlify, você verá a mensagem de Supabase não configurado e não vai conseguir avançar (isso evita “qualquer email entra”).

## Supabase Auth (URLs)

Para signup/confirm/reset funcionarem no Netlify, configure em `Authentication → URL Configuration`:

- **Site URL**: seu domínio do Netlify (ex: `https://<seu-site>.netlify.app`)
- **Redirect URLs**: inclua
	- `https://<seu-site>.netlify.app/**`
	- `http://localhost:5173/**` (dev)

Se o email de confirmação estiver chegando com `localhost:3000` (ou outro localhost), isso é quase sempre porque o **Site URL** do Supabase está apontando para localhost.
Ajuste o Site URL para o domínio público do app e (opcionalmente) configure `VITE_AUTH_REDIRECT_TO` no Netlify para garantir.

## Planos (futuro)

O schema cria `public.user_profiles` com `plan` (`standard`/`premium`). Por enquanto todo usuário nasce como `standard`.
