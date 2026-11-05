import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { logger } from '@onyx/core';
import { serverEnv } from '@onyx/config';

let transporter: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transporter === undefined) {
    const { SMTP_URL } = serverEnv();
    transporter = SMTP_URL ? nodemailer.createTransport(SMTP_URL) : null;
  }
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Versendet eine E-Mail über SMTP.
 * Ohne SMTP_URL (nur in Entwicklung erlaubt, siehe Env-Validierung) wird die Nachricht
 * ins Server-Log geschrieben – ausdrücklich als Entwicklungs-Transport gekennzeichnet.
 * Gibt zurück, ob tatsächlich versendet wurde.
 */
export async function sendMail(msg: MailMessage): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    logger.warn(
      { to: msg.to, subject: msg.subject, body: msg.text },
      '[DEV-MAIL] SMTP nicht konfiguriert – E-Mail nicht versendet',
    );
    return false;
  }
  await transport.sendMail({ from: serverEnv().MAIL_FROM, ...msg });
  return true;
}
