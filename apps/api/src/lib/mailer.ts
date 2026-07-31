import { createTransport, type Transporter } from 'nodemailer'
import { env, hasSmtp } from '../env.ts'

/**
 * Envio de e-mail transacional.
 *
 * Com SMTP_USER/SMTP_PASSWORD definidos, sai pelo SMTP configurado (Gmail, por
 * padrao). Sem eles, o e-mail e impresso no log — dev e teste continuam
 * funcionando sem rede e sem credencial no ambiente de cada pessoa.
 *
 * O transporter e criado na primeira necessidade, e nao no import: assim os
 * testes que nunca disparam e-mail nao abrem conexao nenhuma.
 */
let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // 465 e TLS direto; 587 comeca em claro e sobe para TLS via STARTTLS.
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    })
  }
  return transporter
}

type Mail = {
  to: string
  subject: string
  text: string
  html: string
}

export type MailLogger = { info: (obj: unknown, msg?: string) => void; error: typeof console.error }

async function send(mail: Mail, log: MailLogger): Promise<void> {
  if (!hasSmtp) {
    log.info(
      { to: mail.to, subject: mail.subject, text: mail.text },
      'SMTP nao configurado — e-mail apenas registrado no log',
    )
    return
  }

  await getTransporter().sendMail({
    from: env.MAIL_FROM ?? env.SMTP_USER,
    ...mail,
  })
}

/* -------------------------------------------------------------------------- */
/* Mensagens                                                                  */
/* -------------------------------------------------------------------------- */

export async function sendPasswordResetEmail(
  params: { to: string; name: string; link: string; expiresInMinutes: number },
  log: MailLogger,
): Promise<void> {
  const { to, name, link, expiresInMinutes } = params

  await send(
    {
      to,
      subject: 'Redefinicao de senha — Pipe CRM',
      text: [
        `Ola, ${name}.`,
        '',
        'Recebemos um pedido para redefinir a sua senha no Pipe CRM.',
        `Abra o link abaixo (vale por ${expiresInMinutes} minutos):`,
        '',
        link,
        '',
        'Se nao foi voce quem pediu, ignore este e-mail: sua senha continua a mesma.',
      ].join('\n'),
      html: `
        <div style="font-family: system-ui, -apple-system, Segoe UI, sans-serif; line-height: 1.6; color: #1f2933;">
          <p>Ola, ${escapeHtml(name)}.</p>
          <p>Recebemos um pedido para redefinir a sua senha no <strong>Pipe CRM</strong>.</p>
          <p>
            <a href="${escapeHtml(link)}"
               style="display: inline-block; padding: 10px 18px; border-radius: 8px; background: #4f46e5; color: #fff; text-decoration: none; font-weight: 600;">
              Definir nova senha
            </a>
          </p>
          <p style="font-size: 13px; color: #616e7c;">
            O link vale por ${expiresInMinutes} minutos. Se nao foi voce quem pediu,
            ignore este e-mail — sua senha continua a mesma.
          </p>
          <p style="font-size: 12px; color: #9aa5b1; word-break: break-all;">${escapeHtml(link)}</p>
        </div>
      `,
    },
    log,
  )
}

/** O nome vem do cadastro do usuario: nunca vai cru para dentro do HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
