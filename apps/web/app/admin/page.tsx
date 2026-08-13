'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/session';

// Redirige vers la première section accessible selon le rôle.
export default function AdminHome() {
  const router = useRouter();
  useEffect(() => {
    const role = getUser()?.role;
    if (role === 'MANAGER' || role === 'ADMIN') router.replace('/admin/comptes');
    else if (role === 'LIBRARIAN') router.replace('/admin/catalogue');
    else router.replace('/');
  }, [router]);
  return null;
}
