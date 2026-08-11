import Link from "next/link";
import { PublicInfoPage } from "@/components/PublicInfoPage";

export default function AboutPage() {
  return (
    <PublicInfoPage
      eyebrow="Daily work operator"
      title="A clearer start to your workday"
      intro="Morning brings the work signals you choose into one evidence-backed daily view. Google connections are optional, read-only, and separate from account sign-in."
    >
      <section>
        <h2>What Morning does</h2>
        <p>
          Morning can read selected work sources, find tasks and decisions, and show why each
          recommendation appears. It connects to Gmail, Google Calendar, and Google Drive only
          after you approve each source.
        </p>
      </section>
      <section>
        <h2>You control each connection</h2>
        <p>
          Signing in with Google authenticates your Morning account. It does not give Morning
          access to Gmail, Calendar, or Drive. You connect those services separately in Settings
          and can disconnect them at any time.
        </p>
      </section>
      <p>
        Read the <Link href="/google-data">Google data use disclosure</Link> before connecting an
        account.
      </p>
    </PublicInfoPage>
  );
}
