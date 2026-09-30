export function useRouter() {
  return {
    push: (url: string) => window.open(url, '_blank'),
    replace: (url: string) => window.open(url, '_blank'),
    prefetch: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  };
}

export function usePathname() {
  return "/";
}

export function useSearchParams() {
  return new URLSearchParams();
}
