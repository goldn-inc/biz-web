import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { getMockSession } from "@/lib/session";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = getMockSession();

  return (
    <section className="min-h-screen flex flex-col">
      <div className="flex-1 flex min-h-0">
        <Sidebar storeName={session.storeName} tier={session.tier} />
        <main className="flex-1 min-w-0 overflow-auto p-5 md:p-9 flex flex-col gap-5 md:gap-6">
          {children}
        </main>
      </div>
      <TabBar />
    </section>
  );
}
