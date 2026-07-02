import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Revolution Auction House — what we collect, how we use it, and your choices.",
  // DRAFT: remove this once the policy is finalized so search engines index it.
  robots: { index: false },
};

const EFFECTIVE_DATE = "[PLACEHOLDER: effective date]";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h3 className="font-serif text-xl text-[#e7c77f]">{title}</h3>
      <div className="mt-3 space-y-3 text-sm leading-6 text-gray-300">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#050607] px-6 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-gray-500 hover:text-white">
          ← Back to Home
        </Link>

        <div className="mt-8">
          <h1 className="font-serif text-4xl text-[#c0c0c0] md:text-6xl">
            Revolution Auction House
          </h1>
          <div className="mt-3 h-px w-72 bg-gradient-to-r from-transparent via-[#d6aa55]/70 to-transparent md:w-80" />
          <h2 className="mt-5 font-serif text-2xl text-white md:text-4xl">
            Privacy Policy
          </h2>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          Last updated: {EFFECTIVE_DATE}
        </p>

        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          DRAFT — this is a skeleton for review with legal counsel. Bracketed
          placeholders mark decisions to make before publishing. Remove this
          banner and the noindex flag when finalized.
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-8">
          <Section title="1. Information We Collect">
            <p>
              <strong>Account data:</strong> email address, display name, and
              (optionally) phone number if you enable SMS notifications or
              verify your number.
            </p>
            <p>
              <strong>Verification data:</strong> for higher bidding tiers we
              may collect identity and proof-of-funds information
              [PLACEHOLDER: enumerate exactly what is collected and how long
              it is kept].
            </p>
            <p>
              <strong>Transaction data:</strong> bids, offers, purchases,
              invoices, and shipping addresses. Payments are processed by
              Stripe — we never receive or store full card numbers.
            </p>
            <p>
              <strong>Technical data:</strong> logs and error diagnostics
              (including via Sentry) used to keep the Site working.
              [PLACEHOLDER: cookies/analytics disclosure — list any analytics
              tools in use.]
            </p>
          </Section>

          <Section title="2. How We Use Information">
            <p>
              To run auctions and marketplace sales; process payments and
              ship items; send transactional notifications you request (email
              or SMS — e.g. outbid, offer, and shipping alerts); verify
              bidders and prevent fraud, including monitoring for bid
              manipulation; and comply with legal obligations such as tax
              rules.
            </p>
          </Section>

          <Section title="3. How We Share Information">
            <p>
              We share data only with service providers who process it on our
              behalf: Stripe (payments), EasyPost and carriers (shipping
              labels and delivery), Amazon Web Services (hosting, database,
              and SMS/email delivery), and Sentry (error monitoring). We do
              not sell your personal information. Sellers see the shipping
              details necessary to fulfill your order. We may disclose
              information if required by law.
            </p>
          </Section>

          <Section title="4. SMS and Email Choices">
            <p>
              SMS notifications are opt-in and sent only to verified numbers;
              reply STOP to any message to opt out, or change your
              notification preferences in your dashboard. Transactional
              emails (receipts, winning-bid notices) are part of the service.
              [PLACEHOLDER: marketing email policy, if any.]
            </p>
          </Section>

          <Section title="5. Data Retention">
            <p>
              We keep transaction records as long as needed for legal, tax,
              and dispute purposes [PLACEHOLDER: retention periods].
              Verification data is retained [PLACEHOLDER: period] after
              review.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <p>
              You can access and update account information in your
              dashboard, and request a copy or deletion of your data by
              contacting us. [PLACEHOLDER: state-specific rights — CCPA/CPRA
              if serving California residents; GDPR if serving the EU —
              confirm scope with counsel.]
            </p>
          </Section>

          <Section title="7. Security">
            <p>
              We use industry-standard safeguards: encrypted transport,
              access controls that restrict who can view contact details, and
              payment processing handled entirely by Stripe. No system is
              perfectly secure; report concerns to [PLACEHOLDER: security
              contact email].
            </p>
          </Section>

          <Section title="8. Children">
            <p>
              The Site is not directed to children and is limited to users 18
              and older. We do not knowingly collect data from minors.
            </p>
          </Section>

          <Section title="9. Changes to This Policy">
            <p>
              We may update this policy; material changes will be posted here
              with a new effective date.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Privacy questions: [PLACEHOLDER: support email and business
              mailing address].
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
