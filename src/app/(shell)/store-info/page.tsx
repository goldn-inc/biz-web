"use client";

import { useBizSession } from "@/components/shell/BizSessionProvider";
import { tierLabel } from "@/lib/session";

/**
 * 매장 정보 — b2b_mobile 의 같은 화면(`app/store-info.tsx`)을 웹에 맞춘 것.
 * 백엔드 `/biz/auth/me` 는 계정 프로필만 반환하고 주소·연락처는 내려주지 않으므로
 * 세션에 담긴 값만 보여주고, 변경은 본사 문의로 안내한다.
 */
export default function StoreInfoPage() {
  const { account } = useBizSession();

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-xl font-extrabold tracking-tight m-0">매장 정보</h1>

      <div className="bg-white border border-line rounded-3xl shadow-sm overflow-hidden max-w-xl">
        <InfoRow label="매장명" value={account.storeName || "-"} />
        <InfoRow label="아이디" value={account.loginId || "-"} />
        <InfoRow label="등급" value={tierLabel(account.tier)} />
      </div>

      <p className="text-xs text-caption leading-relaxed m-0">
        매장 주소·연락처·등급 변경은 본사 담당자에게 문의해주세요.
      </p>
    </div>
  );
}

/**
 * 정보 한 줄(라벨 - 값).
 * @param label 항목 이름
 * @param value 표시할 값
 */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 md:px-5 py-3.5 border-t border-slate-100 first:border-t-0">
      <div className="text-sm font-semibold text-body">{label}</div>
      <div className="text-sm font-extrabold text-right break-all">{value}</div>
    </div>
  );
}
