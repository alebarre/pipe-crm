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

```bash
pnpm install
cp .env.example .env      # ja vem apontando para o modo sem Docker
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Front: <http://localhost:5173>
- API: <http://localhost:3333>
- OpenAPI (gerado dos schemas Zod): <http://localhost:3333/docs>

### Banco: dois modos

O `.env.example` vem com **PGlite** — o próprio Postgres compilado para WASM, sem infraestrutura nenhuma:

```
DATABASE_URL=pglite://.pgdata
```

Para usar Postgres de verdade em container, troque para:

```
DATABASE_URL=postgres://pipe:pipe@localhost:5432/pipe_crm
```

e rode `pnpm db:up` antes das migrations. Mesmo dialeto, mesmas migrations, mesmo código de aplicação — só muda o driver.

> **Um processo por vez sobre o mesmo `.pgdata`.** O PGlite não é um servidor: cada processo abre o diretório de dados diretamente. Rodar o seed com a API no ar normalmente *não* dá erro — e é exatamente por isso que é arriscado, já que nada avisa sobre escrita concorrente. Pare a API antes de `db:seed`. Produção usa sempre `postgres://`, que não tem essa limitação.

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

