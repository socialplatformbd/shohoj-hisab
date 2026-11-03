"use client";

import type { ReactNode } from "react";
import { AppProvider } from "./AppProvider";
import { AppShell } from "./AppShell";
import { TxFormProvider } from "./TransactionForm";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <TxFormProvider>
        <AppShell>{children}</AppShell>
      </TxFormProvider>
    </AppProvider>
  );
}
