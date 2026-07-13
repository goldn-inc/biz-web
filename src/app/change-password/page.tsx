"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { bizApiFetch, BizApiError } from "@/lib/api";
import {
  getBizSessionServerSnapshot,
  getBizSessionSnapshot,
  getHydratedServerSnapshot,
  getHydratedSnapshot,
  loadBizSession,
  subscribeBizSession,
  updateBizAccount,
} from "@/lib/session";

/**
 * 임시비밀번호 최초 설정 + 일반 비밀번호 변경. must_change_password 계정은
 * BizSessionProvider 가드가 업무 화면 대신 이 화면으로 보낸다.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  const firstTime = session?.account.mustChangePassword ?? false;

  useEffect(() => {
    // 하이드레이션 전 세션 null 은 판정 보류(하드 리로드 오탈락 방지)
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);

    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError("새 비밀번호는 8자 이상, 영문과 숫자를 모두 포함해야 합니다.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    const session = loadBizSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    setSubmitting(true);
    try {
      await bizApiFetch<{ ok: true }>("/biz/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
        token: session.token,
      });
      updateBizAccount({ mustChangePassword: false });
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof BizApiError
          ? err.message
          : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const fields = [
    {
      id: "currentPassword",
      label: firstTime ? "임시 비밀번호" : "현재 비밀번호",
      value: currentPassword,
      onChange: setCurrentPassword,
    },
    { id: "newPassword", label: "새 비밀번호", value: newPassword, onChange: setNewPassword },
    {
      id: "confirmPassword",
      label: "새 비밀번호 확인",
      value: confirmPassword,
      onChange: setConfirmPassword,
    },
  ];

  return (
    <section className="min-h-screen grid place-items-center px-5 py-12">
      <div className="w-full max-w-md flex flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-primary grid place-items-center text-white text-xl font-extrabold shadow-lg shadow-primary/25">
            金
          </div>
          <div className="text-2xl font-extrabold tracking-tight">비밀번호 변경</div>
          <p className="text-sm text-caption m-0">
            {firstTime
              ? "안전한 사용을 위해 발급받은 임시 비밀번호를 새 비밀번호로 변경해주세요."
              : "새로 사용할 비밀번호를 입력해주세요."}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-line rounded-3xl shadow-sm p-6 md:p-8 flex flex-col gap-5"
        >
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm leading-relaxed text-red-700 m-0 font-medium">{error}</p>
            </div>
          )}

          {fields.map((field) => (
            <div key={field.id} className="flex flex-col gap-2">
              <label className="text-sm font-bold text-body" htmlFor={field.id}>
                {field.label}
              </label>
              <div className="flex items-center gap-3 h-12 px-4 rounded-xl bg-white border border-line focus-within:border-primary">
                <input
                  id={field.id}
                  type="password"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.label}
                  className="flex-1 min-w-0 text-sm outline-none bg-transparent placeholder:text-slate-400"
                />
              </div>
            </div>
          ))}

          <p className="text-xs text-caption m-0">8자 이상, 영문과 숫자를 모두 포함해야 합니다.</p>

          <button
            type="submit"
            disabled={submitting}
            className="h-[52px] rounded-2xl bg-primary hover:bg-primary-light text-white text-base font-bold shadow-lg shadow-primary/25 transition disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {submitting ? "변경 중..." : "비밀번호 변경"}
          </button>
        </form>
      </div>
    </section>
  );
}
