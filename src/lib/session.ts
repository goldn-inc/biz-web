export type BizTier = "NONE" | "WHOLESALE" | "SUPER_WHOLESALE";

/** 백엔드 StoreAccountProfileDto 와 동일 형태. */
export type BizAccount = {
  id: string;
  loginId: string;
  storeId: string;
  storeName: string;
  tier: BizTier;
  mustChangePassword: boolean;
};

const TOKEN_KEY = "goldsilver_biz_access_token";
const ACCOUNT_KEY = "goldsilver_biz_account";

/** sessionStorage 기반 세션(admin-web 관례). 탭 닫으면 만료 — 매장 공용 PC 전제. */
export function saveBizSession(token: string, account: BizAccount): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function loadBizSession(): { token: string; account: BizAccount } | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(TOKEN_KEY);
  const rawAccount = sessionStorage.getItem(ACCOUNT_KEY);
  if (!token || !rawAccount) return null;
  try {
    return { token, account: JSON.parse(rawAccount) as BizAccount };
  } catch {
    return null;
  }
}

type BizSessionValue = { token: string; account: BizAccount };

// useSyncExternalStore 스냅샷은 참조가 안정적이어야 해서 raw 문자열 기준으로 캐시한다.
let snapshotCache: { raw: string; value: BizSessionValue } | null = null;

export function getBizSessionSnapshot(): BizSessionValue | null {
  if (typeof window === "undefined") return null;
  const token = sessionStorage.getItem(TOKEN_KEY);
  const rawAccount = sessionStorage.getItem(ACCOUNT_KEY);
  if (!token || !rawAccount) return null;
  const raw = `${token}|${rawAccount}`;
  if (snapshotCache?.raw === raw) return snapshotCache.value;
  const loaded = loadBizSession();
  if (!loaded) return null;
  snapshotCache = { raw, value: loaded };
  return loaded;
}

export function getBizSessionServerSnapshot(): BizSessionValue | null {
  return null;
}

/** sessionStorage 는 탭 단위라 외부 변경 알림이 없다 — 구독은 형식상 noop. */
export function subscribeBizSession(): () => void {
  return () => {};
}

/**
 * 하이드레이션 완료 여부. SSR/하이드레이션 렌더에서는 세션 스냅샷이 항상 null(서버값)이라,
 * 이 값이 true 가 되기 전에 "세션 없음 → /login" 판정을 내리면 로그인 상태에서도 튕긴다.
 */
export function getHydratedSnapshot(): boolean {
  return true;
}

export function getHydratedServerSnapshot(): boolean {
  return false;
}

export function updateBizAccount(patch: Partial<BizAccount>): void {
  const session = loadBizSession();
  if (!session) return;
  sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...session.account, ...patch }));
}

export function clearBizSession(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(ACCOUNT_KEY);
}

export function tierLabel(tier: BizTier): string {
  if (tier === "SUPER_WHOLESALE") return "도도매 회원";
  if (tier === "WHOLESALE") return "도매 회원";
  return "일반 회원";
}

export function isWholesaleTier(tier: BizTier): boolean {
  return tier === "WHOLESALE" || tier === "SUPER_WHOLESALE";
}
