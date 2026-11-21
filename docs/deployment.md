# Деплој и домен

**Домен: `activen.app`** (купен 21.11.2026). Екстензијата `.app` бара HTTPS на сите поддомени (HSTS preload).

## Адреси

| Адреса                                                  | Намена                                                |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `https://activen.app`                                   | web апликација (PWA)                                  |
| `https://api.activen.app`                               | REST API (`/v1`, `/docs`, `/.well-known/jwks.json`)   |
| `noreply@activen.app`                                   | автоматски мејлови: магични линкови за најава, покани |
| `info@activen.app`, `support@activen.app`, лични адреси | сандаче на тимот (посебен провајдер)                  |

## Конфигурација во продукција

```
NODE_ENV=production
PUBLIC_WEB_URL=https://activen.app
CORS_ORIGINS=https://activen.app
AUTH_ISSUER=https://api.activen.app
AUTH_SIGNING_KEY=<Ed25519 JWK, во secret manager>
GOOGLE_CLIENT_IDS=<web client id>
APPLE_CLIENT_IDS=app.activen.web
TRUST_PROXY_HOPS=1
```

- **Google OAuth:** Authorized JavaScript origin `https://activen.app`.
- **Apple (Sign in with Apple):** Services ID `app.activen.web`, домен `activen.app`, Return URL
  `https://activen.app/sign-in`.
- Тајните (`AUTH_SIGNING_KEY`, клучеви за мејл и AI) се само во secret manager на хостингот, никогаш
  во git или чат.

## DNS (кога ќе се избере хостинг)

| Запис            | Име         | Вредност                                                                    |
| ---------------- | ----------- | --------------------------------------------------------------------------- |
| A/AAAA или CNAME | `@`         | web хостинг                                                                 |
| CNAME            | `api`       | API хостинг                                                                 |
| MX               | `@`         | провајдер за сандачето на тимот (пр. Zoho Mail)                             |
| TXT (SPF)        | `@`         | `v=spf1 include:<сандаче> include:<сервис за мејлови од апликацијата> ~all` |
| TXT/CNAME (DKIM) | по упатство | еден за сандачето, еден за сервисот за мејлови од апликацијата              |
| TXT (DMARC)      | `_dmarc`    | `v=DMARC1; p=quarantine; rua=mailto:dmarc@activen.app`                      |

SPF мора да биде **еден** запис за сите испраќачи. Мејловите од апликацијата одат преку посебен
сервис (Postmark, Resend или Amazon SES), не преку сандачето на тимот.

## Polar AccessLink (поврзување на Polar Flow)

1. На **admin.polaraccesslink.com** најави се со Polar Flow сметка и креирај клиент:
   - Callback URL: `https://api.activen.app/v1/connections/polar/callback`;
   - добиваш `client_id` и `client_secret`.
2. Тајни во хостингот (никогаш во git):
   - `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`;
   - `ACTIVEN_TOKEN_KEY`: 32 бајти base64, за енкрипција на токените;
   - `PUBLIC_API_URL=https://api.activen.app`.
3. Webhook, еднаш по деплојот: `POST https://www.polaraccesslink.com/v3/webhooks` со Basic auth
   (client_id:client_secret) и тело `{"events":["EXERCISE"],"url":"https://api.activen.app/v1/webhooks/polar"}`.
   Polar праќа PING (API-то одговара 200) и враќа `signature_secret_key` **само еднаш**: зачувај го
   како `POLAR_WEBHOOK_SECRET`.
4. Опционално `SYNC_INTERVAL_SECONDS` (стандардно 60): колку често се повторуваат неуспешните настани.
5. Оригиналните датотеки се во `ACTIVEN_FILE_STORE_DIR` (стандардно `.data/files`). Во продукција:
   трајно складиште со backup (подоцна S3/R2).

## Пошта на тимот: Zoho Mail (поставено 21.11.2026)

- План: Zoho Mail Lite, 1 корисник (`vlatko.petrevski@activen.app`) со алијаси `info@` и `support@`, центар zoho.com.
- DNS во Cloudflare (сите „DNS only“):

| Тип | Име                | Вредност                                                     |
| --- | ------------------ | ------------------------------------------------------------ |
| MX  | `@`                | `mx.zoho.com` (10), `mx2.zoho.com` (20), `mx3.zoho.com` (50) |
| TXT | `@`                | `zoho-verification=zb42870744.zmverify.zoho.com`             |
| TXT | `@`                | `v=spf1 include:zohomail.com ~all`                           |
| TXT | `zmail._domainkey` | DKIM јавен клуч од Zoho (селектор `zmail`, вклучен)          |
| TXT | `_dmarc`           | `v=DMARC1; p=none; rua=mailto:vlatko.petrevski@activen.app`  |

- Тестирано: праќање и примање Zoho ↔ Gmail.
- Да се направи:
  - Додавање на сервисот за мејлови од апликацијата: SPF останува **еден** запис со двата include-а
    (`v=spf1 include:zohomail.com include:<сервис> ~all`), а DKIM на сервисот е посебен селектор.
  - DMARC: по неколку недели чисти извештаи, `p=none` → `p=quarantine`.
  - MTA-STS и TLS-RPT: кога ќе има веб на `activen.app`. Политиката
    `https://mta-sts.activen.app/.well-known/mta-sts.txt` може да ја сервира Cloudflare. Без неа не се
    додава `_mta-sts` записот. BIMI е опционален, по `p=quarantine`.
  - Алијаси `info@` и `support@` (додадени).

## Безбедност на доменот

- 2FA и auto-renew на сметката кај регистрарот.
- Registrar lock (заштита од трансфер) вклучен.
- API токен за DNS (ако треба автоматизација) ограничен само на зоната `activen.app` и само на DNS.
