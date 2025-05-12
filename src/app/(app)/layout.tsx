"use client";

import { JazzInspector } from "jazz-inspector";
import { JazzProvider } from "jazz-react";
import { ChatAccount } from "./schema";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <JazzAndAuth>{children}</JazzAndAuth>;
}

function JazzAndAuth({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JazzProvider
        sync={{ peer: "wss://cloud.jazz.tools/?key=aliosman@hellospace.world" }}
        AccountSchema={ChatAccount}
      >
        {children}
        <JazzInspector />
      </JazzProvider>
    </>
  );
}
declare module "jazz-react" {
  interface Register {
    Account: ChatAccount;
  }
}
