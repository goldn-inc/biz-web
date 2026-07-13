"use client";

import { Sidebar } from "@/components/shell/Sidebar";
import { TabBar } from "@/components/shell/TabBar";
import { BizSessionProvider, useBizSession } from "@/components/shell/BizSessionProvider";

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { account } = useBizSession();

  return (
    <section className="min-h-screen flex flex-col">
      <div className="flex-1 flex min-h-0">
        <Sidebar storeName={account.storeName} tier={account.tier} />
        <main className="flex-1 min-w-0 overflow-auto p-5 md:p-9 flex flex-col gap-5 md:gap-6">
          {children}
        </main>
      </div>
      <TabBar />
    </section>
  );
}

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <BizSessionProvider>
      <ShellFrame>{children}</ShellFrame>
    </BizSessionProvider>
  );
}
