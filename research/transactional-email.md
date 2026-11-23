# Emails transactionnels : fournisseur et dev local

Ticket : [#6](https://github.com/Arcades2/tanstack-starter/issues/6) (carte : [#1](https://github.com/Arcades2/tanstack-starter/issues/1)).
Recherche menée le **2026-11-23** ; tous les prix ci-dessous ont été lus ce jour-là sur les pages citées, sauf mention contraire.

## Réponse courte

- **Production : Resend.** Tier gratuit permanent le plus adapté à de petites apps (3 000 emails/mois, 100/jour), SDK HTTP simple, et React Email est maintenu par la même équipe (le SDK accepte directement un composant React).
- **Templates : React Email** (`react-email`, fonction `render` asynchrone → HTML + texte). Indépendant du fournisseur : il produit une chaîne HTML utilisable avec n'importe quel transport.
- **Dev local : Mailpit** (image Docker `axllent/mailpit`, SMTP sur 1025, UI web sur 8025), alimenté via Nodemailer.
- **Une seule interface `Mailer`** avec deux implémentations (`SmtpMailer` pour Mailpit, `ResendMailer` pour la prod), choisie selon l'environnement.

## Comparatif des fournisseurs

| Fournisseur | Tier gratuit | Premier palier payant | Remarques |
| --- | --- | --- | --- |
| **Resend** | 3 000 emails/mois, **100/jour**, 3 domaines, logs 30 jours | Pro : 20 $/mois pour 50 000 emails (puis 0,90 $/1 000 en pay-as-you-go) | SDK `resend`, prop `react`, SMTP aussi disponible. [Pricing](https://resend.com/pricing) |
| **Postmark** | Developer : **100 emails/mois** | Basic : 15 $/mois pour 10 000 emails | Excellente délivrabilité, mais le gratuit ne suffit même pas à une petite app en prod. [Pricing](https://postmarkapp.com/pricing) |
| **Brevo** | **300 emails/jour** (marketing + transactionnel), sans limite de durée | Starter : chiffres contradictoires selon les sources (voir ci-dessous) | Le plan gratuit ajoute le badge « Sent with Brevo ». [Pricing](https://www.brevo.com/pricing/) |
| **Amazon SES** | Pas de quota SES gratuit permanent : crédits AWS Free Tier (jusqu'à 200 $) pendant 6 mois pour les nouveaux comptes | 0,10 $/1 000 emails à la carte | Le moins cher à volume, mais compte AWS, IAM, sortie du sandbox SES : trop de cérémonie pour un starter. [Pricing](https://aws.amazon.com/ses/pricing/) |

Note Brevo : la page de prix et l'article d'aide ([FAQ limites du plan Free](https://help.brevo.com/hc/en-us/articles/208580669)) n'ont pas pu être lus directement (rendu JS / 403). Les chiffres « 300/jour » et le badge Brevo viennent du résumé de résultats de recherche citant cette FAQ ; le prix du palier Starter n'est pas confirmé sur source primaire. À revérifier avant de s'en servir.

### Lecture

- Pour des apps perso (inscription, vérification d'email, reset de mot de passe), le volume réel est de quelques dizaines d'emails par jour. **La limite de 100/jour de Resend est la seule contrainte à surveiller** ; Brevo (300/jour) est le plan B si une app la dépasse sans vouloir payer, au prix du badge Brevo.
- Postmark et SES sont écartés pour le tier gratuit, pas pour la qualité.

## DX et templates : React Email

- React Email permet d'écrire les emails en React/TypeScript ; on les convertit en HTML avec `render` ([intro](https://react.email/docs/introduction)).
- Paquet `react-email`, `render` est **asynchrone** : `const html = await render(<MyTemplate />)` ; options `pretty`, `plainText` ; il existe aussi `toPlainText(html)` ([render](https://react.email/docs/utilities/render)).
- Intégrations documentées : Resend, Nodemailer, Postmark, AWS SES, Brevo, Mailtrap, etc. ([intro](https://react.email/docs/introduction)). React Email ne lie donc pas au fournisseur.
- Le SDK Resend accepte `html`, `text` (généré depuis `html` s'il est omis), ou `react` (Node uniquement, en appelant le composant comme une fonction : `WelcomeEmail({ name })`). Il renvoie `{ data, error }` au lieu de lever une exception ([Send with Node.js](https://resend.com/docs/send-with-nodejs)).

Recommandation : **faire le `render` dans notre code** (et passer `html` + `text` au transport) plutôt que d'utiliser la prop `react` de Resend. Ainsi le même HTML part vers Mailpit en local et vers Resend en prod : ce qu'on voit dans Mailpit est exactement ce qui sera envoyé.

## Compatibilité Netlify

- Les fonctions Netlify synchrones ont une limite d'exécution de **60 s**, non configurable (background : 15 min) ([Configuration](https://docs.netlify.com/build/functions/configuration/)). Un appel HTTP à Resend tient largement dedans.
- `context.waitUntil()` permet de prolonger l'exécution après l'envoi de la réponse, sans bloquer le client ; disponible pour les fonctions déployées depuis le 20/03/2025 ([API](https://docs.netlify.com/build/functions/api/)).
- better-auth fournit les hooks `emailVerification.sendVerificationEmail({ user, url, token }, request)` et `emailAndPassword.sendResetPassword({ user, url, token }, request)`, et recommande de **ne pas attendre** l'envoi (risque de timing attack), en utilisant `waitUntil` ou équivalent en serverless ([Email](https://www.better-auth.com/docs/concepts/email)). Ce point pèse sur l'interface : l'envoi doit pouvoir être « fire-and-forget » mais garanti jusqu'au bout. Comment récupérer `waitUntil` depuis un handler TanStack Start sur Netlify reste à vérifier au moment de l'implémentation.
- Les docs Netlify ne disent rien sur le SMTP sortant (aucune mention de « SMTP » ni du port 25 dans la page de configuration). **Utiliser l'API HTTP de Resend en prod** évite la question ; le SMTP n'est utilisé qu'en local vers Mailpit.

## Dev local : Mailpit

- Mailpit est un serveur SMTP de test avec une interface web pour consulter les emails interceptés, une API REST pour les tests d'intégration, et un binaire statique unique ([docs](https://mailpit.axllent.org/docs/)).
- Image `axllent/mailpit` ; UI sur **8025**, SMTP sur **1025** ([Docker](https://mailpit.axllent.org/docs/install/docker/)).
- L'API REST permet aussi aux tests Playwright de lire l'email de vérification et d'en extraire le lien.

```yaml
# docker-compose.yml (extrait)
services:
  mailpit:
    image: axllent/mailpit
    restart: unless-stopped
    ports:
      - "8025:8025" # UI
      - "1025:1025" # SMTP
```

Côté Node, on envoie à Mailpit avec Nodemailer (`createTransport({ host, port, secure })` puis `sendMail({ from, to, subject, text, html })`) ([Nodemailer](https://nodemailer.com/), [transport SMTP](https://nodemailer.com/smtp)).

## Esquisse : une seule interface d'envoi

```ts
// src/server/mail/mailer.ts
export type Mail = {
  to: string
  subject: string
  html: string
  text: string
}

export interface Mailer {
  send(mail: Mail): Promise<void> // lève une erreur en cas d'échec
}
```

```ts
// src/server/mail/smtp-mailer.ts (dev : Mailpit)
import nodemailer from "nodemailer"
import type { Mail, Mailer } from "./mailer"

export function createSmtpMailer(opts: { host: string; port: number; from: string }): Mailer {
  const transport = nodemailer.createTransport({ host: opts.host, port: opts.port, secure: false })
  return {
    async send(mail: Mail) {
      await transport.sendMail({ from: opts.from, ...mail })
    },
  }
}
```

```ts
// src/server/mail/resend-mailer.ts (prod)
import { Resend } from "resend"
import type { Mail, Mailer } from "./mailer"

export function createResendMailer(opts: { apiKey: string; from: string }): Mailer {
  const resend = new Resend(opts.apiKey)
  return {
    async send(mail: Mail) {
      const { error } = await resend.emails.send({ from: opts.from, ...mail })
      if (error) throw new Error(`Resend: ${error.name}: ${error.message}`)
    },
  }
}
```

```ts
// src/server/mail/index.ts : choix selon l'env (validé par t3-env + Valibot)
import { env } from "~/env"
import type { Mailer } from "./mailer"
import { createResendMailer } from "./resend-mailer"
import { createSmtpMailer } from "./smtp-mailer"

export const mailer: Mailer =
  env.MAIL_TRANSPORT === "resend"
    ? createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
    : createSmtpMailer({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.MAIL_FROM })
```

```tsx
// src/server/mail/send-verification-email.tsx : templates React Email au-dessus du Mailer
import { render, toPlainText } from "react-email"
import { VerifyEmail } from "~/emails/verify-email"
import { mailer } from "."

export async function sendVerificationEmail(to: string, url: string) {
  const html = await render(<VerifyEmail url={url} />)
  await mailer.send({ to, subject: "Vérifiez votre adresse email", html, text: toPlainText(html) })
}
```

Branchement better-auth : dans `sendVerificationEmail` / `sendResetPassword`, appeler la fonction ci-dessus **sans `await`** (via `waitUntil` en prod), comme le demande la doc better-auth.

Choix de conception :

- L'interface ne connaît que du HTML/texte déjà rendu : les templates et le rendu restent hors des adaptateurs, donc un troisième adaptateur (Brevo, Postmark) ne coûte qu'un fichier.
- Les tests unitaires peuvent injecter un `Mailer` en mémoire qui stocke les `Mail` envoyés.
- **Variante plus minimale** : Resend expose aussi du SMTP (`smtp.resend.com`, utilisateur `resend`, mot de passe = clé API, ports 465/587/2465/2587) ([SMTP](https://resend.com/docs/send-with-smtp)). Un seul adaptateur Nodemailer suffirait alors, seule la config changeant entre Mailpit et Resend. On l'écarte comme défaut car rien ne garantit que le SMTP sortant fonctionne bien depuis les fonctions Netlify (non documenté), et le HTTP évite une connexion SMTP par invocation. Elle reste un bon repli.

## Questions ouvertes

- Comment accéder à `context.waitUntil` depuis TanStack Start déployé sur Netlify (à vérifier lors de l'implémentation, lié au ticket d'auth).
- Domaine d'envoi : Resend exige un domaine vérifié pour `from` (`onboarding@resend.dev` est réservé aux tests) ([Node.js](https://resend.com/docs/send-with-nodejs)). Chaque app dérivée devra configurer ses enregistrements DNS.
- Prix Brevo Starter à confirmer sur source primaire si Brevo devient nécessaire.
