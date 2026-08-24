import { clearBizSession } from "./session";

/**
 * biz-web API 클라이언트. 백엔드는 NestJS 글로벌 프리픽스 `api` 포함 —
 * 기본값은 로컬 개발 백엔드, 배포 시 NEXT_PUBLIC_API_URL 로 교체.
 * (next.config.ts 가 같은 env 의 origin 을 CSP connect-src 에 반영한다.)
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

/**
 * 401 이 와도 세션 만료로 보지 않는 경로. 비밀번호 변경의 401 은 "현재 비밀번호 불일치"라
 * 세션과 무관하다(back_end biz-auth.service.ts:338) — 오타 한 번에 로그아웃시키면 안 된다.
 */
const SESSION_EXPIRY_EXEMPT_PATHS = ["/biz/auth/change-password"];

/**
 * 서버가 401 을 주면 이 탭의 토큰은 이미 죽은 값이다. 비밀번호 변경·원격 로그아웃·계정 정지·계약
 * 종료는 `sessions_revoked_at` 을 찍고, 그 시각 이전에 발급된 access 토큰을 즉시 거부한다
 * (back_end biz-auth.service.ts:315-322). biz-web 에는 리프레시 경로가 없으므로 401 은 곧 재로그인이다.
 *
 * 세션을 지우지 않으면 화면은 로그인 상태로 보이면서 모든 조회가 빈 목록·실패 토스트로만 나타나,
 * 매장은 원인도 복구 방법도 알 수 없다(새로고침해도 낫지 않는다).
 *
 * router 가 아니라 하드 내비게이션을 쓴다 — 죽은 세션으로 렌더된 화면 상태를 통째로 버린다
 * (admin-web `lib/apiAuth.ts:8` 의 redirectToLogin 과 같은 방식).
 * @param path 요청 경로
 * @param token 요청에 실었던 토큰 — 없으면(로그인 등) 만료가 아니다
 */
function handleUnauthorized(path: string, token: string | null | undefined): void {
  if (!token || typeof window === "undefined") return;
  if (SESSION_EXPIRY_EXEMPT_PATHS.some((exempt) => path.startsWith(exempt))) return;
  clearBizSession();
  if (window.location.pathname === "/login") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(`/login?expired=1&next=${next}`);
}

export class BizApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** 쿠폰 검증 등 표준 사유 코드(백엔드 4.2.2 규약) — 없으면 undefined */
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "BizApiError";
  }
}

type FetchOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
};

/**
 * multipart 업로드(카탈로그 이미지 등) — Content-Type 을 지정하지 않아 브라우저가
 * boundary 포함 multipart/form-data 를 자동 설정하게 둔다.
 */
export async function bizApiUpload<T>(
  path: string,
  formData: FormData,
  token: string | null,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
  } catch {
    throw new BizApiError(0, "서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.");
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path, token);
    const body = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const message =
      typeof body.message === "string"
        ? body.message
        : "업로드에 실패했습니다. 잠시 후 다시 시도해주세요.";
    throw new BizApiError(response.status, message);
  }
  return data as T;
}

/**
 * 파일 응답(CSV 템플릿 등) — Authorization 헤더가 필요해서 <a href> 로는 받을 수 없다.
 * Blob 으로 받아 임시 objectURL 로 내려받는다.
 */
export async function bizApiDownload(
  path: string,
  fileName: string,
  token: string | null,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    throw new BizApiError(0, "서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.");
  }
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path, token);
    throw new BizApiError(response.status, "파일을 내려받지 못했습니다.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function bizApiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, token } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new BizApiError(0, "서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) handleUnauthorized(path, token);
    const body = data !== null && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const message =
      typeof body.message === "string"
        ? body.message
        : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    throw new BizApiError(response.status, message, reason);
  }
  return data as T;
}
