import { PublicInfoPage } from "@/components/PublicInfoPage";

export default function GoogleDataPage() {
  return (
    <PublicInfoPage
      eyebrow="Google API disclosure"
      title="How Morning uses Google data"
      intro="Morning asks for a separate, read-only permission for each Google source. You can use the app without connecting all three."
    >
      <section>
        <h2>Gmail</h2>
        <p>
          If you connect Gmail, Morning reads messages that match its configured work and meeting-note
          searches. It stores the matching message content so it can extract tasks, decisions, and
          supporting evidence.
        </p>
      </section>
      <section>
        <h2>Google Calendar</h2>
        <p>
          If you connect Calendar, Morning reads events from your primary calendar to add meeting
          context and timing to your daily brief.
        </p>
      </section>
      <section>
        <h2>Google Drive</h2>
        <p>
          If you connect Drive, Morning searches for matching work files and exports supported document
          content so it can identify tasks, decisions, and evidence.
        </p>
      </section>
      <section>
        <h2>Storage and processing</h2>
        <ul>
          <li>OAuth access and refresh tokens are encrypted before they are stored.</li>
          <li>Matching source content and derived work items are stored in the application database.</li>
          <li>
            Source text may be sent to the language-model provider configured by the Morning operator
            to produce the user-facing task and report features.
          </li>
          <li>Morning does not sell Google user data or use it for advertising.</li>
        </ul>
      </section>
      <section>
        <h2>Your controls</h2>
        <p>
          You can reconnect or disconnect each Google source in Settings. Disconnecting revokes the
          corresponding Google grant and removes the saved token. Previously imported content is handled
          through the separate data-deletion process.
        </p>
      </section>
    </PublicInfoPage>
  );
}
