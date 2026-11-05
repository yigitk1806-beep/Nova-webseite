/** Minimaler SMTP-Empfänger für E2E-Tests: schreibt jede Mail als JSON-Zeile in eine Datei. */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { simpleParser } from 'mailparser';
import { SMTPServer } from 'smtp-server';

const file = process.argv[2];
if (!file) throw new Error('Pfad zur Mail-Datei fehlt');
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, '');

new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, _session, callback) {
    simpleParser(stream)
      .then((mail) => {
        const to = Array.isArray(mail.to)
          ? mail.to.map((t) => t.text).join(',')
          : (mail.to?.text ?? '');
        appendFileSync(file, `${JSON.stringify({ to, subject: mail.subject, text: mail.text })}\n`);
        callback();
      })
      .catch(callback);
  },
}).listen(2525, '127.0.0.1');
