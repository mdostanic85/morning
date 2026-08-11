import { PublicInfoPage } from "@/components/PublicInfoPage";

export default function DataDeletionPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return (
    <PublicInfoPage
      eyebrow="Account controls"
      title="Disconnect a source or request deletion"
      intro="Revoking future access and deleting content already imported into Morning are separate actions."
    >
      <section>
        <h2>Stop future Google access</h2>
        <p>
          Open Settings, find Gmail, Google Calendar, or Google Drive, and choose Disconnect. Morning
          revokes that grant with Google and deletes its saved token.
        </p>
      </section>
      <section>
        <h2>Delete imported content and account data</h2>
        {supportEmail ? (
          <p>
            Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> from the address on your Morning
            account. State whether you want a specific source deleted or your full account and imported
            content removed. The operator will confirm the request and completion date.
          </p>
        ) : (
          <p>
            Deletion requests are not ready for production because no support email is configured. The
            operator must set NEXT_PUBLIC_SUPPORT_EMAIL before inviting users.
          </p>
        )}
      </section>
      <section>
        <h2>Also remove Morning from Google</h2>
        <p>
          You can review and remove third-party access from your Google Account security settings. This
          stops Google access but does not by itself delete content already imported into Morning.
        </p>
      </section>
    </PublicInfoPage>
  );
}
