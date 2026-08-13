import { Header } from '@/components/header';

export default function GuichetLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
