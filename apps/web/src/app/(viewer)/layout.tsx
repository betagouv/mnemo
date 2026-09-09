import { TrpcReactProvider } from "@/shared/api/trpc";

export default function ViewerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <TrpcReactProvider>{children}</TrpcReactProvider>;
}
