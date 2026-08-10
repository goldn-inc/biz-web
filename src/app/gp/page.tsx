import { redirect } from "next/navigation";

/** GP 첫 화면 = 재고 목록(gp-design.md §5 — 매장이 하루 종일 여는 화면). */
export default function GpIndexPage() {
  redirect("/gp/inventory");
}
