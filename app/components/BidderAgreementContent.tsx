"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Bump these whenever the agreement text changes, then re-prompt acceptance.
// Surfaced on the agreement page and recorded with each buyer's consent.
export const AGREEMENT_VERSION = "2026-06-26";
export const AGREEMENT_EFFECTIVE_DATE = "June 26, 2026";

// ───────────────────────────────────────────────────────────────────────────
// The agreement itself is plain Markdown. To edit, just edit the text below:
//   "## N. Title"  for each clause,  "-" for bullet lists,  "|" tables, etc.
// No JSX/className wrangling — styling + heading anchors + the table of contents
// are all generated automatically from this string.
// ───────────────────────────────────────────────────────────────────────────
export const BIDDER_AGREEMENT_MARKDOWN = `
This Buyer & Bidder Agreement (the "Agreement") is a binding contract between you ("you," "bidder," or "buyer") and Revolution Auction House ("we," "us," or the "Company"). By creating an account, registering to bid, placing a bid, submitting an offer, or purchasing an item, you accept and agree to be bound by this Agreement, our policies, and the terms shown at checkout or on any invoice. If you do not agree, do not use the platform.

## 1. Definitions

- **Auction** — a timed online auction listing offered through the platform.
- **Marketplace** — fixed-price listings available for immediate "Buy Now" purchase or offer.
- **Hammer Price** — the winning bid amount for an auction lot, excluding fees, taxes, and shipping.
- **Buyer's Premium** — a percentage-based fee added to the Hammer Price on auction purchases.
- **Reserve** — a confidential minimum price below which a lot will not sell.
- **Lot / Item** — any collectible or product offered for sale on the platform.

## 2. Eligibility and Registration

You must be at least 18 years old and able to form a legally binding contract to register. You agree to provide accurate, current, and complete registration information and to keep it updated. We may refuse, suspend, or revoke registration at our discretion.

## 3. Account Security

You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Notify us immediately of any unauthorized use. We are not liable for losses arising from your failure to safeguard your account.

## 4. Buyer Verification and Bidding Limits

Your account may be assigned a verification tier and a corresponding bidding limit. Higher tiers may require identity verification, proof of funds, or additional review. We may approve, deny, reduce, or increase any limit at our discretion, and we may require verification before honoring a bid, offer, or purchase.

## 5. Bidding and Binding Bids

Every bid you submit is final and binding and constitutes a binding offer to purchase at that amount. You may not retract, cancel, or reduce a bid once placed. If you are the leading or winning bidder, you are obligated to complete the purchase. Bids may be placed manually or through proxy (maximum) bidding, in which the system bids on your behalf up to your specified maximum.

## 6. Proxy Bidding

When you set a maximum bid, the platform will automatically bid the minimum necessary to keep you in the lead, up to your maximum. Your maximum bid is confidential. Placing a maximum bid is a binding commitment up to that amount.

## 7. Auction Closing and Extended Bidding

Auctions close at their scheduled end time, subject to soft-close rules. A bid placed in the final moments of an auction may extend the closing time to allow fair competing bids. Auctions may close at different times, and the platform's clock is the official time of record.

## 8. Reserves

Some lots are subject to a confidential Reserve. If bidding does not meet the Reserve, the lot will not sell, no winner is declared, and no obligation to purchase arises. We are not required to disclose whether a lot has a Reserve or the Reserve amount.

## 9. Winning Bids, Marketplace Purchases, and Offers

If you are the winning bidder on a lot that meets its Reserve, you have entered a binding purchase obligation.

**Marketplace and Buy Now listings.** When you select "Buy Now" on a marketplace listing, you make a binding commitment to purchase that item at the listed price, plus applicable taxes and shipping. While you complete checkout, the listing may be reserved and shown as pending, making it temporarily unavailable to other buyers; if you do not complete payment, the reservation may expire and the item may return to the marketplace. Submitting an offer is a binding offer to purchase at the amount you specify, and if the seller accepts it, you are obligated to complete the purchase.

An invoice will be generated reflecting amounts due. Winning bids, Buy Now purchases, and accepted offers are final and binding.

## 10. Buyer's Premium and Fees

Auction purchases are subject to a Buyer's Premium added to the Hammer Price, plus any applicable fees disclosed at checkout or on the invoice. The applicable Buyer's Premium rate is shown on the listing and at checkout.

## 11. Payment

You must pay all amounts due — including Hammer Price or purchase price, Buyer's Premium, fees, applicable taxes, and shipping — by the payment deadline shown on your invoice. Payments are processed through our third-party payment processor and may include card and bank (ACH) options. Bank payments may take several business days to clear; items are not considered paid until funds clear. You authorize us and our processor to charge the payment method you provide for amounts you owe.

## 12. Sales Tax

Applicable sales tax will be calculated and added based on the shipping destination and applicable law, and shown at checkout or on the invoice. You are responsible for all taxes associated with your purchase.

## 13. Default and Remedies

If you fail to pay in full by the deadline or otherwise breach this Agreement, we may, in addition to any other remedy: cancel the sale; charge or re-attempt your payment method; suspend or terminate your account; revoke bidding privileges; re-list, re-sell, or otherwise dispose of the item; recover any deficiency, fees, and reasonable costs of collection; and report non-payment. A winning bid or accepted offer that goes unpaid remains a debt you owe.

## 14. Shipping, Title, and Risk of Loss

Shipping is arranged after payment clears and is calculated based on the item and destination. Title and risk of loss pass to you upon our delivery of the item to the carrier, unless otherwise required by law. Tracking is provided where available. You are responsible for providing an accurate shipping address.

## 15. Condition of Items — Sold "As-Is"

All items are sold "AS-IS" and "WHERE-IS," with all faults, in their condition at the time of sale. Photographs, descriptions, and any condition notes are provided for guidance only and are not warranties. You are responsible for reviewing all available information before bidding or purchasing. Colors and details may vary from images.

## 16. Authenticity and Grading

Where an item references third-party grading, authentication, or certification, that designation is the opinion of the issuing party and not a guarantee by us. We make no independent representation as to grade, authenticity, or value beyond what is expressly stated in the listing.

## 17. Returns

Except where required by law or expressly stated, all sales are final and non-refundable. Any return or claim must follow our then-current policies and be submitted within the stated window, if any.

## 18. Prohibited Conduct

You agree not to: place bids without intent or ability to pay; engage in shill bidding, bid manipulation, or collusion; use bots or unauthorized automated means; create multiple or fraudulent accounts; interfere with the platform's operation; or use the platform for any unlawful purpose. Violations may result in cancellation of transactions, suspension, or termination.

## 19. Account Review, Suspension, and Termination

We may review, restrict, suspend, or terminate any account for fraud prevention, bidding abuse, payment risk, suspicious activity, or violation of this Agreement, with or without notice. Outstanding obligations survive any suspension or termination.

## 20. Privacy

Your use of the platform is subject to our Privacy Policy. By using the platform, you consent to our collection and use of information as described there and as necessary to process transactions, verify identity, prevent fraud, and provide the service.

## 21. Disclaimers and Limitation of Liability

The platform and all items are provided without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement, to the fullest extent permitted by law. To the fullest extent permitted by law, our total liability arising out of or relating to a transaction will not exceed the amount you paid for the item at issue, and we will not be liable for indirect, incidental, special, consequential, or punitive damages.

## 22. Indemnification

You agree to indemnify and hold harmless Revolution Auction House and its affiliates from any claims, losses, liabilities, and expenses (including reasonable attorneys' fees) arising out of your use of the platform, your bids or purchases, or your breach of this Agreement.

## 23. Dispute Resolution and Governing Law

This Agreement is governed by the laws of the State of New Jersey, without regard to its conflict-of-laws rules. Any dispute arising out of or relating to this Agreement or the platform will be resolved on an individual basis, and you waive any right to participate in a class or representative action, to the extent permitted by law. Venue for any permitted court action lies in the state or federal courts located in New Jersey.

## 24. Changes to this Agreement

We may update this Agreement at any time. Material changes will be reflected by an updated version and effective date, and continued use after changes take effect constitutes acceptance. You may be asked to re-accept the current version before bidding or purchasing.

## 25. Entire Agreement and Severability

This Agreement, together with our posted policies and the terms shown at checkout, constitutes the entire agreement between you and us regarding its subject matter. If any provision is held unenforceable, the remaining provisions remain in full force and effect.

## 26. Contact

Questions about this Agreement may be directed to Revolution Auction House through the contact options provided on the platform.
`;

// Slug used for both heading ids and the ToC links, so they always match.
function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function headingText(children: any): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(headingText).join("");
  if (children?.props?.children) return headingText(children.props.children);
  return "";
}

const mdComponents = {
  h2: ({ children }: any) => (
    <h2
      id={slugify(headingText(children))}
      className="mt-10 scroll-mt-24 font-serif text-xl text-white first:mt-0 md:text-2xl print:text-black"
    >
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="mt-6 font-serif text-lg text-white print:text-black">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="mt-3 leading-6 text-gray-300 md:leading-7 print:text-black">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="mt-3 list-disc space-y-1 pl-6 text-gray-300 md:leading-7 print:text-black">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="mt-3 list-decimal space-y-1 pl-6 text-gray-300 md:leading-7 print:text-black">{children}</ol>
  ),
  li: ({ children }: any) => <li className="leading-6 md:leading-7">{children}</li>,
  a: ({ href, children }: any) => (
    <a href={href} className="text-[#e7c77f] underline hover:text-white">{children}</a>
  ),
  strong: ({ children }: any) => (
    <strong className="font-semibold text-white print:text-black">{children}</strong>
  ),
  table: ({ children }: any) => (
    <table className="mt-4 w-full border-collapse text-sm">{children}</table>
  ),
  th: ({ children }: any) => (
    <th className="border border-white/15 px-3 py-2 text-left text-white print:text-black">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-white/10 px-3 py-2 text-gray-300 print:text-black">{children}</td>
  ),
};

const toc = BIDDER_AGREEMENT_MARKDOWN.split("\n")
  .filter((line) => line.startsWith("## "))
  .map((line) => {
    const text = line.replace(/^##\s+/, "").trim();
    return { text, id: slugify(text) };
  });

export default function BidderAgreementContent() {
  return (
    <div className="text-gray-300 print:text-black">
      {toc.length > 1 && (
        <nav className="mb-8 rounded-lg border border-white/10 bg-white/[0.02] p-4 print:hidden">
          <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Contents</div>
          <ol className="mt-3 space-y-1.5 text-sm">
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-gray-300 hover:text-[#e7c77f]">
                  {item.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {BIDDER_AGREEMENT_MARKDOWN}
      </ReactMarkdown>

      <p className="mt-10 rounded-lg border border-yellow-400/20 bg-yellow-400/10 p-4 text-xs leading-6 text-yellow-200 print:border-gray-300 print:bg-white print:text-black">
        This agreement is a working platform draft and should be reviewed by an
        attorney before public launch.
      </p>
    </div>
  );
}
