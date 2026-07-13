"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { bizApiFetch, BizApiError } from "@/lib/api";
import { saveBizSession, type BizAccount } from "@/lib/session";

type ErrorType = null | "mismatch" | "disabled";

type LoginResponse = {
  accessToken: string;
  account: BizAccount;
};

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorType, setErrorType] = useState<ErrorType>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 403(정지·계약종료·잠금)은 자물쇠 스타일로 서버 문구를 그대로 안내한다.
  // 입력은 제출 중에만 잠근다 — 403 후에도 다른 계정으로 재시도할 수 있어야 한다.
  const disabled = submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorType(null);
    setErrorMessage(null);
    try {
      const result = await bizApiFetch<LoginResponse>("/biz/auth/login", {
        method: "POST",
        body: { loginId, password },
      });
      saveBizSession(result.accessToken, result.account);
      router.replace(result.account.mustChangePassword ? "/change-password" : "/dashboard");
    } catch (error) {
      if (error instanceof BizApiError && error.status === 403) {
        setErrorType("disabled");
        setErrorMessage(error.message);
      } else {
        setErrorType("mismatch");
        setErrorMessage(
          error instanceof BizApiError && error.status !== 401 ? error.message : null,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary grid place-items-center text-white text-xl font-extrabold shadow-lg shadow-primary/25">
            金
          </div>
          <div className="text-2xl font-extrabold tracking-tight">
            금은마켓 <span className="text-primary">BIZ</span>
          </div>
          <p className="text-sm text-caption m-0">사업자 전용 매장 관리 서비스</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-line rounded-3xl shadow-sm p-6 md:p-8 flex flex-col gap-5"
        >
          {errorType === "mismatch" && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4 text-red-600 shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">
                {errorMessage ?? "아이디 또는 비밀번호가 일치하지 않습니다. 다시 확인해주세요."}
              </p>
            </div>
          )}
          {errorType === "disabled" && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-700 shrink-0 mt-0.5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-sm leading-relaxed text-amber-800 m-0 font-medium">
                {errorMessage ??
                  "이 계정은 현재 비활성화 상태입니다. 이용을 원하시면 담당 관리자에게 문의해주세요."}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-body" htmlFor="loginId">
              아이디
            </label>
            <div
              className={`flex items-center gap-3 h-12 px-4 rounded-xl bg-white ${
                disabled
                  ? "border border-line bg-slate-50"
                  : errorType === "mismatch"
                    ? "border-2 border-red-300"
                    : "border border-line focus-within:border-primary"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`w-[18px] h-[18px] shrink-0 ${errorType === "mismatch" ? "text-red-400" : "text-caption"}`}>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <input
                id="loginId"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={disabled}
                placeholder="아이디"
                className="flex-1 min-w-0 text-sm outline-none bg-transparent placeholder:text-slate-400 disabled:text-caption"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-bold text-body" htmlFor="password">
              비밀번호
            </label>
            <div
              className={`flex items-center gap-3 h-12 px-4 rounded-xl bg-white ${
                errorType === "mismatch" ? "border-2 border-red-300" : "border border-line focus-within:border-primary"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={`w-[18px] h-[18px] shrink-0 ${errorType === "mismatch" ? "text-red-400" : "text-caption"}`}>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={disabled}
                placeholder="비밀번호"
                className="flex-1 min-w-0 text-sm outline-none bg-transparent placeholder:text-slate-400"
              />
              <button
                type="button"
                aria-label="비밀번호 표시"
                onClick={() => setShowPassword((v) => !v)}
                className="text-caption hover:text-body"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="h-[52px] rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 transition disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>

          {!disabled && (
            <div className="border-t border-slate-100 pt-4 flex flex-col gap-1 text-center">
              <div className="text-sm font-semibold text-body">비밀번호를 잊으셨나요?</div>
              <div className="text-xs text-caption leading-relaxed">
                계정과 임시 비밀번호는 담당 관리자가 발급합니다.
                <br />
                담당 관리자에게 문의해주세요.
              </div>
            </div>
          )}
        </form>
        <p className="text-xs text-caption text-center m-0">
          계정이 없다면 금은마켓 파트너 담당자를 통해 발급받을 수 있습니다.
        </p>
      </div>
    </section>
  );
}
