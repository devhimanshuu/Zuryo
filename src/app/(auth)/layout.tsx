import { Wordmark } from "@/components/shared/wordmark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="container-page flex h-16 items-center">
        <Wordmark />
      </header>
      <main id="main" className="container-page grid place-items-center pb-16">
        {children}
      </main>
    </div>
  );
}
