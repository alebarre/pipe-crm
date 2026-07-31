import { hash, verify } from '@node-rs/argon2'

/**
 * Hash de senha (Argon2id).
 *
 * Mora neste pacote — e nao em apps/api, onde as rotas de auth vivem — porque
 * o seed tambem precisa criar usuarios e nao pode importar de um app. Duas
 * implementacoes do mesmo hash e como duas fontes de verdade para o mesmo
 * dado: a hora que uma muda de parametro, a outra invalida as senhas.
 *
 * Fica fora de @pipe/shared de proposito: aquele pacote roda no navegador, e
 * @node-rs/argon2 e binario nativo.
 *
 * Parametros: os recomendados pelo OWASP para Argon2id (19 MiB, 2 iteracoes,
 * paralelismo 1). O custo esta em memoria, nao em CPU — e o que atrapalha
 * ataque com GPU.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS)
}

/**
 * Devolve false em vez de estourar quando o hash guardado esta corrompido ou
 * veio de outro algoritmo: para quem chama, a resposta util e sempre "essa
 * senha nao serve", e um throw aqui viraria 500 numa tela de login.
 */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTIONS)
  } catch {
    return false
  }
}
