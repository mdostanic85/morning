import { PublicInfoPage } from "@/components/PublicInfoPage";

export default function TermsPage() {
  return (
    <PublicInfoPage
      eyebrow="Terms"
      title="Terms for using Morning"
      intro="Morning helps organize work signals. It does not replace your judgment, source systems, or your responsibility to verify important decisions."
    >
      <section>
        <h2>Your account</h2>
        <p>
          Keep your account secure and connect only sources you are authorized to use. You are responsible
          for the material you import and for respecting your employer or client policies.
        </p>
      </section>
      <section>
        <h2>Generated results</h2>
        <p>
          Summaries, priorities, and extracted tasks can be incomplete or wrong. Review the cited source
          evidence before acting on anything important.
        </p>
      </section>
      <section>
        <h2>Service changes</h2>
        <p>
          Features, integrations, and limits may change as the product develops. Material changes to these
          terms or the privacy notice should be published before they take effect.
        </p>
      </section>
      <section>
        <h2>Production review required</h2>
        <p>
          These product terms are an implementation draft. The operator must add the legal entity,
          governing law, support contact, effective date, and any commercial terms before a public launch.
        </p>
      </section>
    </PublicInfoPage>
  );
}
