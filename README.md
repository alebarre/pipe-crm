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

Se a porta 3333 ou 5173 estiver ocupada, o `pnpm dev` falha com `EADDRINUSE` — normalmente é uma instância antiga ainda rodando. Descubra quem está segurando com `ss -ltnp | grep -E ':3333|:5173'`.

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

