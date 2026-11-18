import { Logger } from "@nestjs/common";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
}

/** Outbound email. Implementations: log (development); a provider adapter comes with deployment. */
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
