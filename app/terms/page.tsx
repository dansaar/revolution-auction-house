import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Revolution Auction House — auctions, marketplace purchases, payments, and shipping.",
  // DRAFT: remove this once the terms are finalized so search engines index it.
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

export default function TermsPage() {
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
            Terms of Service
          </h2>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          Last updated: {EFFECTIVE_DATE}
        </p>

        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          DRAFT — this is a skeleton for review with legal counsel. Bracketed
          placeholders mark business decisions that must be made before
          publishing. Remove this banner and the noindex flag when finalized.
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-8">
          <Section title="1. Acceptance of These Terms">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your use of
              Revolution Auction House (the &quot;Site&quot;), operated by
              [PLACEHOLDER: legal entity name and state of formation]. By
              creating an account, placing a bid, submitting an offer, or
              completing a purchase, you agree to these Terms and to the{" "}
              <Link href="/bidder-agreement" className="text-[#e7c77f] underline">
                Buyer &amp; Bidder Agreement
              </Link>
              , which is incorporated by reference. If they conflict, the
              Buyer &amp; Bidder Agreement controls for bidding matters.
            </p>
          </Section>

          <Section title="2. Eligibility and Accounts">
            <p>
              You must be at least 18 years old and able to form a binding
              contract. You are responsible for your account credentials and
              all activity under your account. High-value bidding may require
              identity or proof-of-funds verification at tiers we set from
              time to time; we may decline, limit, or revoke bidding
              privileges at our discretion.
            </p>
          </Section>

          <Section title="3. Auctions and Bidding">
            <p>
              Every bid is a binding offer to purchase. The Site supports
              maximum (proxy) bidding: the system bids on your behalf up to
              your stated maximum. Some lots carry a confidential reserve; if
              the reserve is not met, the lot is not sold. Auction timing,
              extensions, and finalization are determined by the Site.
            </p>
            <p>
              [PLACEHOLDER: bid retraction policy — currently bids cannot be
              retracted; confirm.]
            </p>
          </Section>

          <Section title="4. Buyer Premium, Taxes, and Fees">
            <p>
              Winning bids are subject to the buyer premium displayed on the
              lot page (shown before you bid). Applicable sales tax is
              calculated at checkout. All fees are displayed prior to payment.
            </p>
          </Section>

          <Section title="5. Marketplace Purchases and Offers">
            <p>
              Marketplace listings may be purchased at the listed price or,
              where enabled, via an offer to the seller. An accepted offer
              creates a binding purchase at the accepted amount. Items are
              reserved during checkout; abandoned checkouts release the item.
            </p>
          </Section>

          <Section title="6. Payment">
            <p>
              Payments are processed by Stripe; we do not store your card
              details. Payment for won lots and accepted offers is due within
              [PLACEHOLDER: payment window, e.g. 72 hours]. Non-payment may
              result in cancellation of the sale, suspension of your account,
              and re-listing of the item.
            </p>
          </Section>

          <Section title="7. Shipping and Risk of Loss">
            <p>
              Items ship insured with tracking. Risk of loss passes
              [PLACEHOLDER: on delivery / on carrier handoff]. You are
              responsible for providing an accurate shipping address.
              [PLACEHOLDER: international shipping policy — currently US
              only.]
            </p>
          </Section>

          <Section title="8. Authenticity, Returns, and Refunds">
            <p>
              [PLACEHOLDER: authenticity guarantee — the Site advertises
              expert verification; state exactly what is guaranteed and the
              remedy (refund/return window) if an item is found inauthentic.]
            </p>
            <p>
              [PLACEHOLDER: general return policy — auction sales are
              typically final; confirm.]
            </p>
          </Section>

          <Section title="9. Prohibited Conduct">
            <p>
              You may not: bid on your own items or arrange others to do so
              (shill bidding); manipulate prices or interfere with another
              user&apos;s bids; use bots or scrapers; misrepresent items or
              your identity; or use the Site for any unlawful purpose. We
              monitor bidding activity for manipulation and may cancel bids,
              void sales, and terminate accounts.
            </p>
          </Section>

          <Section title="10. Intellectual Property and Non-Affiliation">
            <p>
              The Site and its content are owned by us or our licensors.
              Pokémon and all related marks are property of their respective
              owners. Revolution Auction House is not affiliated with,
              endorsed by, or sponsored by Nintendo, The Pokémon Company, or
              PSA. Grading references describe third-party certifications.
            </p>
          </Section>

          <Section title="11. Disclaimers and Limitation of Liability">
            <p>
              The Site is provided &quot;as is.&quot; To the fullest extent
              permitted by law, our total liability arising out of any sale is
              limited to [PLACEHOLDER: cap, e.g. the amount you paid for the
              item at issue]. We are not liable for indirect, incidental, or
              consequential damages.
            </p>
          </Section>

          <Section title="12. Disputes and Governing Law">
            <p>
              [PLACEHOLDER: governing law state; arbitration clause and class
              action waiver — decide with counsel; small claims carve-out.]
            </p>
          </Section>

          <Section title="13. Changes to These Terms">
            <p>
              We may update these Terms. Material changes will be posted on
              this page with a new effective date; continued use after changes
              constitutes acceptance.
            </p>
          </Section>

          <Section title="14. Contact">
            <p>
              Questions about these Terms: [PLACEHOLDER: support email and
              business mailing address].
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
