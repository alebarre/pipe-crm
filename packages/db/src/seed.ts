import type { InteractionType, LeadStatus, UserRole } from '@pipe/shared'
import { closeDb, db } from './index.ts'
import { hashPassword } from './password.ts'
import { interactions, leads, users } from './schema.ts'

/**
 * O primeiro admin nasce aqui, e so aqui: /auth/register cria sempre um
 * usuario comum. Se o cadastro publico pudesse escolher o papel, qualquer um
 * viraria administrador do CRM.
 *
 * As credenciais saem do .env quando definidas — em producao o seed roda uma
 * vez com SEED_ADMIN_PASSWORD proprio, nunca com o default abaixo.
 */
const SEED_USERS: Array<{ name: string; email: string; password: string; role: UserRole }> = [
  {
    name: 'Administrador',
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@pipecrm.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'admin12345',
    role: 'admin',
  },
  {
    name: 'Usuario Demo',
    email: process.env.SEED_USER_EMAIL ?? 'user@pipecrm.local',
    password: process.env.SEED_USER_PASSWORD ?? 'user12345',
    role: 'user',
  },
]

type SeedLead = {
  name: string
  email: string
  company: string | null
  status: LeadStatus
  valueCents: number
  notes: string | null
  daysAgo: number
  interactions: Array<{ type: InteractionType; content: string; daysAgo: number }>
}

const SEED: SeedLead[] = [
  {
    name: 'Marina Prado',
    email: 'marina.prado@northwind.com.br',
    company: 'Northwind Logistica',
    status: 'qualified',
    valueCents: 4_850_000,
    notes: 'Precisa integrar com o ERP legado antes de fechar.',
    daysAgo: 21,
    interactions: [
      { type: 'call', content: 'Primeira ligacao. Dor principal: rastreio de frota.', daysAgo: 20 },
      { type: 'meeting', content: 'Demo com o time de operacoes. Boa recepcao.', daysAgo: 12 },
      { type: 'email', content: 'Enviado material tecnico sobre a API de integracao.', daysAgo: 5 },
    ],
  },
  {
    name: 'Rafael Aguiar',
    email: 'rafael@studioquatro.com',
    company: 'Studio Quatro',
    status: 'proposal',
    valueCents: 1_290_000,
    notes: 'Proposta enviada, aguardando aprovacao do socio.',
    daysAgo: 34,
    interactions: [
      { type: 'email', content: 'Contato inicial vindo do formulario do site.', daysAgo: 34 },
      { type: 'meeting', content: 'Levantamento de requisitos, 45min.', daysAgo: 18 },
      { type: 'note', content: 'Proposta v2 enviada com desconto de 8%.', daysAgo: 3 },
    ],
  },
  {
    name: 'Camila Fontes',
    email: 'camila.fontes@vertice.med.br',
    company: 'Vertice Saude',
    status: 'won',
    valueCents: 9_600_000,
    notes: 'Contrato anual assinado. Onboarding comeca dia 5.',
    daysAgo: 62,
    interactions: [
      { type: 'call', content: 'Indicacao do cliente Northwind.', daysAgo: 60 },
      { type: 'meeting', content: 'Apresentacao para a diretoria.', daysAgo: 40 },
      { type: 'note', content: 'Contrato assinado. Passar para o time de CS.', daysAgo: 9 },
    ],
  },
  {
    name: 'Diego Salvatore',
    email: 'diego@cafedaesquina.com',
    company: 'Cafe da Esquina',
    status: 'lost',
    valueCents: 340_000,
    notes: 'Achou caro para o porte da operacao. Retomar em 6 meses.',
    daysAgo: 47,
    interactions: [
      { type: 'email', content: 'Pedido de orcamento pelo site.', daysAgo: 47 },
      { type: 'call', content: 'Sem budget neste trimestre.', daysAgo: 30 },
    ],
  },
  {
    name: 'Helena Braz',
    email: 'helena.braz@lumine.io',
    company: 'Lumine',
    status: 'contacted',
    valueCents: 2_150_000,
    notes: null,
    daysAgo: 9,
    interactions: [
      { type: 'email', content: 'Respondeu a sequencia de outbound.', daysAgo: 8 },
      { type: 'call', content: 'Agendada demo para a proxima semana.', daysAgo: 2 },
    ],
  },
  {
    name: 'Otavio Nunes',
    email: 'otavio.nunes@grupomarante.com.br',
    company: 'Grupo Marante',
    status: 'new',
    valueCents: 0,
    notes: null,
    daysAgo: 2,
    interactions: [],
  },
  {
    name: 'Beatriz Sandoval',
    email: 'bia@sandovaladvocacia.com.br',
    company: 'Sandoval Advocacia',
    status: 'new',
    valueCents: 780_000,
    notes: 'Chegou por indicacao. Nao contatada ainda.',
    daysAgo: 1,
    interactions: [],
  },
  {
    name: 'Lucas Ferrer',
    email: 'lucas.ferrer@boreal.energy',
    company: 'Boreal Energia',
    status: 'qualified',
    valueCents: 12_400_000,
    notes: 'Maior deal do pipeline. Exige SSO e auditoria.',
    daysAgo: 15,
    interactions: [
      { type: 'meeting', content: 'Reuniao tecnica com o time de seguranca.', daysAgo: 10 },
      { type: 'note', content: 'Pediram documentacao de compliance.', daysAgo: 4 },
    ],
  },
]

const MS_PER_DAY = 86_400_000
const now = Date.now()
const daysAgoToDate = (days: number) => new Date(now - days * MS_PER_DAY)

async function main() {
  console.log('Limpando tabelas...')
  // interactions e os tokens caem junto por causa do ON DELETE CASCADE
  await db.delete(leads)
  await db.delete(users)

  console.log(`Inserindo ${SEED_USERS.length} usuarios...`)
  for (const person of SEED_USERS) {
    await db.insert(users).values({
      name: person.name,
      email: person.email,
      passwordHash: await hashPassword(person.password),
      role: person.role,
    })
    console.log(`  ${person.role.padEnd(5)} ${person.email}`)
  }

  console.log(`Inserindo ${SEED.length} leads...`)
  for (const item of SEED) {
    const createdAt = daysAgoToDate(item.daysAgo)

    const inserted = await db
      .insert(leads)
      .values({
        name: item.name,
        email: item.email,
        company: item.company,
        status: item.status,
        valueCents: item.valueCents,
        notes: item.notes,
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: leads.id })

    const lead = inserted[0]
    if (!lead) throw new Error(`Falha ao inserir o lead ${item.email}`)

    if (item.interactions.length > 0) {
      await db.insert(interactions).values(
        item.interactions.map((it) => ({
          leadId: lead.id,
          type: it.type,
          content: it.content,
          occurredAt: daysAgoToDate(it.daysAgo),
        })),
      )
    }
  }

  const totalInteractions = SEED.reduce((acc, l) => acc + l.interactions.length, 0)
  console.log(
    `Pronto: ${SEED_USERS.length} usuarios, ${SEED.length} leads e ${totalInteractions} interacoes.`,
  )
}

main()
  .catch((error) => {
    console.error('Seed falhou:', error)
    process.exitCode = 1
  })
  .finally(() => closeDb())
