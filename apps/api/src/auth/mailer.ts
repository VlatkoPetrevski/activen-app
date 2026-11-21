import { Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** Outbound email. Implementations: log (development, tests) and SMTP (production). */
export interface Mailer {
  send(email: OutgoingEmail): Promise<void>;
}

/** Writes emails to the log. The body (with its one-time link) is logged only outside production. */
export class LogMailer implements Mailer {
  private readonly logger = new Logger("Mailer");

  constructor(private readonly revealBody: boolean) {}

  async send(email: OutgoingEmail): Promise<void> {
    this.logger.log({
      msg: "email (log transport)",
      to: email.to,
      subject: email.subject,
      ...(this.revealBody ? { text: email.text } : {}),
    });
  }
}

export interface SmtpOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

/** Sends through an SMTP server over TLS (port 465) or STARTTLS (587). */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    private readonly options: SmtpOptions,
    transport?: Transporter,
  ) {
    this.transport =
      transport ??
      createTransport({
        host: options.host,
        port: options.port,
        secure: options.port === 465,
        auth: { user: options.user, pass: options.password },
      });
  }

  async send(email: OutgoingEmail): Promise<void> {
    await this.transport.sendMail({
      from: this.options.from,
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
  }
}
