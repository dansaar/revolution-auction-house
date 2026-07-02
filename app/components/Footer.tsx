import Link from "next/link";

const EXPLORE_LINKS = [
  { href: "/auctions", label: "Live Auctions" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/auctions/results", label: "Auction Results" },
  { href: "/marketplace/results", label: "Sold Listings" },
];

const ACCOUNT_LINKS = [
  { href: "/signin", label: "Sign In" },
  { href: "/signup", label: "Create Account" },
  { href: "/dashboard", label: "Buyer Dashboard" },
  { href: "/verify", label: "Get Verified" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#050607] text-white">
      <div className="mx-auto grid max-w-[1500px] gap-10 px-6 py-12 sm:grid-cols-3 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="sm:col-span-3 lg:col-span-1">
          <div className="flex items-center gap-3">
            <img
              src="/logo.png"
              alt="Revolution Auction House"
              className="h-12 w-auto object-contain"
            />
            <div className="leading-tight">
              <div className="font-serif text-base tracking-[0.3em] text-[#c0c0c0]">
                REVOLUTION
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[#c8a96b]">
                Auction House
              </div>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-6 text-gray-400">
            High-end Pokémon card auctions and marketplace. Verified buyers,
            authenticated cards, insured shipping.
          </p>
          <div className="mt-4 text-xs uppercase tracking-[0.3em] text-[#d6aa55]">
            For Collectors, By Collectors
          </div>
        </div>

        <FooterColumn title="Explore" links={EXPLORE_LINKS} />
        <FooterColumn title="Account" links={ACCOUNT_LINKS} />
        <FooterColumn
          title="Legal"
          links={[
            { href: "/bidder-agreement", label: "Bidder Agreement" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/privacy", label: "Privacy Policy" },
          ]}
        />
      </div>

      <div className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-gray-600 sm:flex-row">
          <span>
            © {new Date().getFullYear()} Revolution Auction House. All rights
            reserved.
          </span>
          <span>
            Not affiliated with Nintendo, The Pokémon Company, or PSA.
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-[0.22em] text-gray-500">
        {title}
      </div>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-gray-400 transition hover:text-[#e7c77f]"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
