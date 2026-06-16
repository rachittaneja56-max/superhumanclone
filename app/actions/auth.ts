'use server'

import { destroySession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function signOutAction() {
  await destroySession()
  redirect('/')
}
