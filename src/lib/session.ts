export type BizTier = "NONE" | "WHOLESALE" | "SUPER_WHOLESALE";

export type BizSession = {
  storeName: string;
  tier: BizTier;
};

/**
 * TODO(auth 연동): 실제 로그인 세션/백엔드 응답으로 교체 예정. 지금은 디자인 이식
 * 단계라 도매 화면·게이팅 UI를 확인할 수 있게 고정값을 반환한다.
 */
export function getMockSession(): BizSession {
  return {
    storeName: "종로 골드스타",
    tier: "NONE",
  };
}

export function tierLabel(tier: BizTier): string {
  if (tier === "SUPER_WHOLESALE") return "도도매 회원";
  if (tier === "WHOLESALE") return "도매 회원";
  return "일반 회원";
}

export function isWholesaleTier(tier: BizTier): boolean {
  return tier === "WHOLESALE" || tier === "SUPER_WHOLESALE";
}
