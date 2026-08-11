import Link from "next/link";
import { PublicInfoPage } from "@/components/PublicInfoPage";

export default function PrivacyPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return (
    <PublicInfoPage
      eyebrow="Privacy notice"
      title="Your work data stays tied to the features you choose"
      intro="This notice explains the information Morning handles, why it is needed, and the controls available to you."
    >
      <section>
        <h2>Information Morning handles</h2>
        <p>
          Morning stores your account profile, connection status, encrypted integration tokens,
          imported work sources, tasks, knowledge items, reports, and service diagnostics.
        </p>
      </section>
      <section>
        <h2>How information is used</h2>
        <p>
          The information is used to connect the sources you request, prepare your daily view, preserve
          evidence for recommendations, maintain the service, and respond to support or security issues.
        </p>
      </section>
      <section>
        <h2>Google data</h2>
        <p>
          The detailed source-by-source explanation is available in the
          <Link href="/google-data"> Google data use disclosure</Link>.
        </p>
      </section>
      <section>
        <h2>Deletion and contact</h2>
        <p>
          Follow the <Link href="/data-deletion">data-deletion instructions</Link>.
          {supportEmail ? (
            <> Questions can be sent to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</>
          ) : (
            <> The production operator must publish a support email before inviting users.</>
          )}
        </p>
      </section>
    </PublicInfoPage>
  );
}
