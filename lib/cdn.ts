export function cdnUrl(path?: string | null) {
  if (!path || path === "undefined" || path === "/logo.png") {
    return "/logo.png";
  }

  if (path.startsWith("http") || path.startsWith("/")) {
    return path;
  }

  const cdn = process.env.NEXT_PUBLIC_CDN_URL;

  if (!cdn) {
    return path;
  }

  return `${cdn}/${path}`;
}
