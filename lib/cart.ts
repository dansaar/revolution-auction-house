// Lightweight client-side cart for marketplace listings the buyer wants to
// purchase (the "Add to Cart" flow). Stored in localStorage; the /cart page
// merges these with the user's existing payment obligations at checkout.

export type StoredCartItem = {
  id: string;
  type: "MARKETPLACE";
  title: string;
  amount: string; // listing price, e.g. "$50"
  image?: string;
  chargeTax?: boolean;
  taxRate?: number;
};

const KEY = "rah_cart";
export const CART_EVENT = "rah-cart-updated";

function read(): StoredCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: StoredCartItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(CART_EVENT));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function getCart(): StoredCartItem[] {
  return read();
}

export function cartCount(): number {
  return read().length;
}

export function isInCart(id: string): boolean {
  return read().some((i) => i.id === id);
}

// Returns false if the item was already in the cart.
export function addToCart(item: StoredCartItem): boolean {
  const items = read();
  if (items.some((i) => i.id === item.id)) return false;
  write([...items, item]);
  return true;
}

export function removeFromCart(id: string) {
  write(read().filter((i) => i.id !== id));
}

// Remove a set of marketplace ids (e.g. after they've been checked out).
export function removeManyFromCart(ids: string[]) {
  const set = new Set(ids);
  write(read().filter((i) => !set.has(i.id)));
}
