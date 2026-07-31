/**
 * Aceita apenas destinos internos.
 *
 * O `?redirect=` da URL de login e um parametro que qualquer um monta. Sem
 * filtro, um link como `/login?redirect=https://site-falso/` faria o proprio
 * app jogar o usuario recem-autenticado num endereco de terceiro — a receita
 * de phishing conhecida como open redirect.
 *
 * Regra: precisa comecar com uma barra e nao pode comecar com duas (`//evil`
 * e `/\evil` sao endereco absoluto disfarcado para o navegador).
 */
export function safeRedirect(target: string | undefined, fallback = '/leads'): string {
  if (!target) return fallback
  if (!target.startsWith('/')) return fallback
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback

  return target
}
