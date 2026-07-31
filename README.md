# Pipe CRM

Mini-CRM de leads — esqueleto completo da stack padrão Node.js: monorepo pnpm, Fastify + Drizzle no backend, React + Vite no frontend, e **um único conjunto de schemas Zod compartilhado entre os dois**.

Não é um tutorial: é um CRUD ponta a ponta funcionando, com testes, build de produção e as armadilhas reais já resolvidas.

---

## A ideia central

O mesmo dado costuma ser descrito em cinco lugares: coluna do banco, tipo do model, validação da API, tipo do client HTTP e formulário. Quando divergem, nasce um bug que o compilador não pega.

Aqui a definição existe **uma vez** e se propaga:

```
packages/db/schema.ts   ──infere──>  tipos do banco ($inferSelect)
                                            │
packages/shared/*.ts    ──────┬──> validação do Fastify (runtime)
   (schemas Zod)              ├──> serialização da resposta + OpenAPI
                              ├──> tipos do client HTTP (compile time)
                              ├──> validação do formulário (React Hook Form)
                              └──> validação dos search params da URL (TanStack Router)
```

Mude `createLeadSchema` e o TypeScript quebra no formulário. Esse é o ponto.

---

## Stack

| Camada | Escolha |
|---|---|
| Runtime | Node 22+ · TypeScript · pnpm workspaces |
| Backend | Fastify 5 · `fastify-type-provider-zod` · Drizzle ORM · PostgreSQL |
| Sessão | JWT + refresh rotativo em cookie httpOnly · Argon2id · Nodemailer |
| Frontend | React 19 · Vite 7 · TanStack Router + Query · Tailwind 4 · React Hook Form |
| Contrato | Zod 4 em `packages/shared` |
| Qualidade | Vitest · Biome |

---

## Rodando

Requisitos: **Node 22+** e **pnpm** (`corepack enable pnpm`).

Escolha um dos dois modos de banco. **O código da aplicação é idêntico nos dois** — mesmo dialeto, mesmas migrations, mesmo schema Drizzle. Só muda o driver, decidido pela `DATABASE_URL`.

### Opção A — Postgres em Docker (o modo de verdade)

É o que espelha produção. Requer Docker.

```bash
pnpm install
cp .env.example .env
```

Edite o `.env` e troque a linha do banco:

```diff
- DATABASE_URL=pglite://.pgdata
+ DATABASE_URL=postgres://pipe:pipe@localhost:5432/pipe_crm
```

Então suba o container e prepare o banco:

```bash
pnpm db:up        # sobe o postgres:17 e espera ficar saudavel
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Para derrubar depois: `pnpm db:down` (ou `pnpm db:reset` para apagar o volume e começar do zero).

> Se der `permission denied` no socket do Docker, seu usuário não está no grupo `docker`:
> `sudo usermod -aG docker $USER` e faça logout/login. Enquanto isso, use a Opção B.

### Opção B — sem infraestrutura nenhuma

Usa **PGlite**: o próprio Postgres compilado para WASM, rodando dentro do processo Node. Não precisa de Docker nem de serviço rodando. É o padrão do `.env.example`.

```bash
pnpm install
cp .env.example .env      # ja vem com DATABASE_URL=pglite://.pgdata
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Os dados ficam em `.pgdata/` na raiz do projeto (ignorado pelo git). Para zerar, basta apagar a pasta e rodar `db:migrate` e `db:seed` de novo.

> **Um processo por vez sobre o mesmo `.pgdata`.** O PGlite não é um servidor: cada processo abre o diretório de dados diretamente. Rodar o seed com a API no ar normalmente *não* dá erro — e é exatamente por isso que é arriscado, já que nada avisa sobre escrita concorrente. Pare a API antes de `db:seed`. Produção usa sempre `postgres://`, que não tem essa limitação.

### Depois de subir

- Front: <http://localhost:5173>
- API: <http://localhost:3333>
- OpenAPI (gerado dos schemas Zod): <http://localhost:3333/docs>

O app pede login. O `pnpm db:seed` cria as duas contas (as credenciais saem do `.env`, com estes valores por padrão):

| Conta | Senha | Papel |
|---|---|---|
| `admin@pipecrm.local` | `admin12345` | admin |
| `user@pipecrm.local` | `user12345` | user |

Se a porta 3333 ou 5173 estiver ocupada, o `pnpm dev` falha com `EADDRINUSE` — normalmente é uma instância antiga ainda rodando. Descubra quem está segurando com `ss -ltnp | grep -E ':3333|:5173'`.

---

## Autenticação e papéis

Sessão por **JWT de curta duração + refresh token rotativo**, os dois em cookie `httpOnly`.

```
POST /auth/login  ──> pipe_at  (JWT, 15 min, path=/)
                      pipe_rt  (token opaco, 7 dias, path=/api/auth)

401 numa chamada qualquer
   └─> POST /auth/refresh  ──> rotaciona pipe_rt e emite pipe_at novo
                               (o client repete a requisição original)
```

Decisões que valem saber:

- **Cookie `httpOnly`, não `localStorage`.** O JavaScript da página não lê o token, então um XSS não exfiltra a sessão. Dá para fazer assim porque front e API vivem na mesma origem — em dev pelo proxy do Vite, em produção pelo mesmo domínio. `SameSite=Lax` cobre o CSRF sem precisar de token anti-forgery.
- **Refresh rotativo com detecção de reuso.** Cada uso do refresh emite um novo e revoga o anterior. Se um token já rotacionado reaparecer, a *família* inteira é revogada — o sinal clássico de cookie roubado. No front, um mutex em `lib/api.ts` garante um único refresh em voo; sem ele, três 401 simultâneos disparariam três rotações e o app deslogaria o usuário sozinho.
- **Só o hash vai para o banco.** Senha em Argon2id; refresh e token de recuperação em SHA-256 (são valores aleatórios, não há o que adivinhar).
- **Cadastro público nunca cria admin.** O papel não vem do corpo da requisição: `/auth/register` grava `user` fixo, e o primeiro admin nasce do `db:seed`.
- **Recuperação de senha não revela quem tem conta.** `/auth/forgot-password` responde igual para e-mail existente ou não; o login também usa a mesma mensagem para senha errada e e-mail desconhecido.

### Quem pode o quê

| Rota | admin | user |
|---|---|---|
| `GET /api/leads`, `/leads/stats`, `/leads/:id` | ✅ | ✅ |
| `POST /api/leads/:id/interactions` | ✅ | ✅ |
| `POST`, `PATCH`, `DELETE` de lead | ✅ | ⛔ 403 |

No front, `_authed.tsx` é uma rota *pathless* que guarda tudo em `routes/_authed/`: o `beforeLoad` consulta `/auth/me` antes de montar a tela e manda para `/login?redirect=...` quem não tem sessão. Os botões de admin somem para o papel `user` — mas isso é UX; a autorização que vale é a do servidor, e existe um teste para cada uma das combinações acima.

### E-mail

`/auth/forgot-password` manda o link por SMTP. Sem `SMTP_USER`/`SMTP_PASSWORD` no `.env`, nada sai pela rede: o e-mail é impresso no log da API, o que basta para desenvolver e é o modo usado nos testes. Com Gmail, `SMTP_PASSWORD` é uma [senha de app](https://myaccount.google.com/apppasswords), não a senha da conta.

---

## Arquitetura de execução

`pnpm dev` sobe **dois processos Node independentes**:

```
┌─ processo 1 ────────────────────┐     ┌─ processo 2 ──────────────────┐
│  tsx watch src/server.ts        │     │  vite                         │
│  = O BACKEND                    │     │  ≠ o frontend                 │
│  Fastify escutando :3333        │     │  servidor de arquivos :5173   │
│  executa apps/api/              │     │  compila e entrega o bundle   │
└─────────────────────────────────┘     └───────────────────────────────┘
```

O Vite é um processo Node, mas **não executa** o código React — ele compila `apps/web/` e entrega os arquivos por HTTP. Quem executa o React é o navegador. Nada de `apps/web` roda no servidor; é justamente por isso que esta stack não tem SSR.

| Código | Onde executa |
|---|---|
| `apps/api/**` | processo Node na porta 3333 — **o backend** |
| `apps/web/**` | navegador do usuário |
| `packages/shared/**` | nos **dois** — mesmo arquivo importado dos dois lados |
| `packages/db/**` | só no processo da API |

### Por que tudo parece estar na 5173

O navegador nunca fala com a 3333 diretamente. Um `fetch('/api/leads')` sai para a 5173 e o Vite repassa:

```
navegador ──GET /api/leads──> Vite :5173 ──proxy──> Fastify :3333 ──> banco
```

É de propósito: elimina CORS e cookie cross-site em desenvolvimento.

### Onde fica o banco

- **PGlite (Opção B):** não existe processo de banco. O Postgres em WASM roda **dentro do próprio processo da API**, sobre a pasta `.pgdata/`. Daí a regra de um processo por vez.
- **Docker (Opção A):** um terceiro processo — container `postgres:17` na porta 5432, acessado por TCP.

### Em produção

Os dois viram artefatos de natureza diferente:

| | Build | O que se publica |
|---|---|---|
| Backend | `apps/api/dist/server.js` | `node dist/server.js` num servidor ou container |
| Frontend | `apps/web/dist/` | HTML/CSS/JS estáticos num CDN ou nginx |

O Vite deixa de existir — é ferramenta de desenvolvimento. Como o proxy some junto, é aí que os dois precisam ser servidos sob o mesmo domínio (ou o CORS configurado de verdade).

---

## Estrutura

```
apps/
  api/          Fastify — rotas, mappers, testes de integração
  web/          Vite + React — rotas, componentes, client HTTP
packages/
  shared/       schemas Zod, tipos, labels, helpers de moeda  ← o contrato
  db/           schema Drizzle, migrations, seed, operadores do ORM
```

`apps/web` **não consegue** importar de `apps/api`: são duas aplicações independentes, com builds e deploys separados, que só dividem um repositório. O único caminho entre elas é HTTP.

### Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev` | sobe API e front em paralelo |
| `pnpm build` | build de produção dos dois |
| `pnpm test` | Vitest em todos os pacotes |
| `pnpm typecheck` / `pnpm lint` | `tsc --noEmit` / Biome |
| `pnpm db:generate` | gera SQL a partir de mudanças no schema Drizzle |
| `pnpm db:migrate` / `db:seed` / `db:studio` | aplica, popula, inspeciona |
| `pnpm db:up` / `db:down` / `db:reset` | Postgres em Docker |

---

