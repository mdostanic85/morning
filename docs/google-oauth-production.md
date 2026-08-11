# Google authentication and Workspace connections

Morning uses Google in two separate flows.

1. Clerk authenticates a person and creates their Morning session. Signing in this way does not grant access to Gmail, Calendar, or Drive.
2. Morning's Google Workspace OAuth client asks for read access to one integration at a time. The user starts this flow from Settings after signing in.

Use separate OAuth clients and separate environment variables for these jobs. Clerk's Google client belongs in Clerk. The Workspace client belongs in Google Cloud and is configured in Morning as `GOOGLE_INTEGRATIONS_CLIENT_ID` and `GOOGLE_INTEGRATIONS_CLIENT_SECRET`.

## Integration scopes

| Connection | Scope | What Morning reads |
| --- | --- | --- |
| Gmail | `https://www.googleapis.com/auth/gmail.readonly` | Messages matching the configured work and meeting-note queries |
| Calendar | `https://www.googleapis.com/auth/calendar.readonly` | Events from the user's primary calendar |
| Drive | `https://www.googleapis.com/auth/drive.readonly` | Matching files and supported document exports |

All three scopes are read-only. Gmail readonly and Drive readonly are restricted scopes. A production app that stores or sends this data through its server should expect Google verification and an annual security assessment.

## Redirect URI

All three integrations share one callback:

```text
https://YOUR-PRODUCTION-DOMAIN/api/connections/gmail/callback
```

Set `WORKLIGHT_APP_URL` to the same HTTPS origin. The app rejects a missing or non-HTTPS production value so a preview deployment cannot silently change the OAuth redirect.

For local development, use:

```text
http://localhost:3000/api/connections/gmail/callback
```

## Token and state handling

- Each Clerk account maps to one `user_profiles` row through `clerk_user_id`.
- Connection status and encrypted tokens are unique per app user and provider.
- OAuth state is stored in its own table as a SHA-256 hash, tied to the app user, expires after ten minutes, and is deleted atomically on first use.
- The callback records scopes returned by Google. It does not mark a source connected when the user did not grant that source's scope.
- Access tokens are refreshed on the server. An `invalid_grant` response deletes the unusable grant and marks the connection as needing attention.
- Disconnect calls Google's revocation endpoint before deleting the local token.

## Required public URLs

Configure the production OAuth consent screen with public URLs on the verified domain:

- App home: `/about`
- Privacy notice: `/privacy`
- Terms: `/terms`
- Google data use: `/google-data`
- Data deletion: `/data-deletion`

Set `NEXT_PUBLIC_SUPPORT_EMAIL` before inviting users. The terms page is an implementation draft and needs the operator's legal entity, governing law, effective date, and commercial terms.

## Multi-user release gate

This change isolates Google and other connector credentials by app user. Morning's projects, imported source items, tasks, knowledge, and reports still use the original single-user data model. Do not enable open public sign-up until those tables and every query that reads them are tenant-scoped and covered by two-user isolation tests. Background Hydra schedules also need an explicit owner before they can run in a database with more than one user.
