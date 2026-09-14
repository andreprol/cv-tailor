'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { deleteApplication } from '@/lib/repository'

export async function deleteApplicationAction(applicationId: string): Promise<void> {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    redirect('/login')
  }
  const db = createServiceClient()
  await deleteApplication(db, applicationId, userId)
  revalidatePath('/')
}
