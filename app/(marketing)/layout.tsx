import { MarketingNav } from '@/components/landing/MarketingNav';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-sans">
      <div id="nav-sentinel" className="absolute top-0 h-[100vh] w-px pointer-events-none opacity-0" />
      <MarketingNav />
      <main className="flex-1">{children}</main>
    </div>
  );
}
