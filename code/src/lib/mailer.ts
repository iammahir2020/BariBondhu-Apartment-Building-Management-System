/**
 * Sends email through our own SMTP service (Gmail for now; decisions §2), set by the `SMTP_*` and `MAIL_FROM`
 * variables. Server only. Never put a password in an email (NFR-04).
 *
 * @author Mahir Al Kamal
 */
import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { requireEnv } from '@/lib/env';

/** One email to send. */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** Sends one email. Services take this as a dependency, so tests can collect emails instead. */
export type EmailSender = (email: OutgoingEmail) => Promise<void>;

let transporter: Transporter | undefined;

/**
 * An {@link EmailSender} that sends through the SMTP service in the environment.
 * @returns The sender.
 */
export function smtpEmailSender(): EmailSender {
  return async ({ to, subject, text }) => {
    const port = Number(requireEnv('SMTP_PORT'));
    transporter ??= nodemailer.createTransport({
      host: requireEnv('SMTP_HOST'),
      port,
      secure: port === 465,
      auth: { user: requireEnv('SMTP_USER'), pass: requireEnv('SMTP_PASS') },
    });
    await transporter.sendMail({ from: requireEnv('MAIL_FROM'), to, subject, text });
  };
}
