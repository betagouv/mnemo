import { SiteHeader, ViewerFooter } from "@/widgets/site-shell";

export default function ViewerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex-none">
        <SiteHeader compact />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      <ViewerFooter />
    </div>
  );
}
