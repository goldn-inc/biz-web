/**
 * biz-web API 클라이언트. 백엔드는 NestJS 글로벌 프리픽스 `api` 포함 —
 * 기본값은 로컬 개발 백엔드, 배포 시 NEXT_PUBLIC_API_URL 로 교체.
 * (next.config.ts 가 같은 env 의 origin 을 CSP connect-src 에 반영한다.)
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
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
