"use client";

import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  clearBizSession,
  getBizSessionServerSnapshot,
  getBizSessionSnapshot,
  subscribeBizSession,
  type BizAccount,
} from "@/lib/session";

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
  const session = useSyncExternalStore(
    subscribeBizSession,
    getBizSessionSnapshot,
    getBizSessionServerSnapshot,
  );

  useEffect(() => {
    if (!session) {
      router.replace("/login");
    } else if (session.account.mustChangePassword) {
      router.replace("/change-password");
    }
  }, [session, router]);

  if (!session || session.account.mustChangePassword) return null;

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
