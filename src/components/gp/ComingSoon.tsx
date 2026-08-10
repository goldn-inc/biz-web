/** 구현 순서(§6)상 아직 안 만든 GP 화면의 자리 — 단계가 오면 페이지 본문으로 교체된다. */
export function ComingSoon({ title, stage }: { title: string; stage: string }) {
  return (
    <div className="flex-1 grid place-items-center">
      <div className="text-center">
        <div className="text-[15px] font-extrabold mb-1">{title}</div>
        <div className="text-caption">구현 순서 {stage} — 준비 중입니다.</div>
      </div>
    </div>
  );
}
