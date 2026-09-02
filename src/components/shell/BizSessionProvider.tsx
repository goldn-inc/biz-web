"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  clearBizSession,
  getBizSessionServerSnapshot,
  getBizSessionSnapshot,
  getHydratedServerSnapshot,
  getHydratedSnapshot,
  saveBizSession,
  subscribeBizSession,
  type BizAccount,
} from "@/lib/session";
import { bizApiFetch } from "@/lib/api";

type BizSessionContextValue = {
  account: BizAccount;
  token: string;
  logout: () => void;
};

const BizSessionContext = createContext<BizSessionContextValue | null>(null);

/**
 * (shell) 하위 화면의 세션 가드 겸 컨텍스트. 토큰 없으면 /login,
 * 임시비밀번호 미변경 계정은 /change-password 로 보낸다(업무 화면 진입 차단).
 */
export function BizSessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(
    subscribeBizSession,
    getHydratedSnapshot,
    getHydratedServerSnapshot,
  );
  const session = useSyncExternalStore(
    subscribeBizSession,
    getBizSessionSnapshot,
    getBizSessionServerSnapshot,
  );

  useEffect(() => {
    if (!hydrated) return; // 하이드레이션 전 세션 null 은 판정 보류(하드 리로드 오탈락 방지)
    if (!session) {
      // 가려던 곳을 들려 보낸다 — GP 직행 링크(/gp/…)가 로그인 후 카탈로그로 새지 않게
      router.replace(pathname ? `/login?next=${encodeURIComponent(pathname)}` : "/login");
    } else if (session.account.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [hydrated, session, router, pathname]);

  /*
   * 저장된 계정은 로그인 시점 스냅샷이다. 본사가 등급을 올려도(서버는 매 요청 DB 를 본다)
   * 세션은 끊기지 않으므로, 새로고침해도 tier="NONE" 이 남아 도매 화면이 계속 잠긴 얼굴을
   * 그린다. 셸 진입마다 서버 권위값으로 계정을 갱신한다.
   */
  const token = session?.token ?? null;
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void bizApiFetch<BizAccount>("/biz/auth/me", { token })
      .then((me) => {
        if (!cancelled) saveBizSession(token, me);
      })
      .catch(() => {
        // 갱신 실패는 저장 스냅샷으로 계속 진행한다(가용성 우선). 실제 권한은 서버가 재검증한다.
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!hydrated || !session || session.account.mustChangePassword) return null;

  return (
    <BizSessionContext.Provider
      value={{
        account: session.account,
        token: session.token,
        logout: () => {
          clearBizSession();
          router.replace("/login");
        },
      }}
    >
      {children}
    </BizSessionContext.Provider>
  );
}

export function useBizSession(): BizSessionContextValue {
  const value = useContext(BizSessionContext);
  if (!value) {
    throw new Error("useBizSession 은 BizSessionProvider((shell) 레이아웃) 안에서만 사용합니다.");
  }
  return value;
}
