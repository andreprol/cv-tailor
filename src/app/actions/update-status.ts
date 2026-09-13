'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/auth-server'
import { updateApplicationStatus } from '@/lib/repository'
import type { ApplicationStatus } from '@/lib/types'

export async function updateStatusAction(applicationId: string, status: ApplicationStatus): Promise<void> {
  let userId: string
  try {
    userId = await getCurrentUserId()
  } catch {
    redirect('/login')
  }
  const db = createServiceClient()
  await updateApplicationStatus(db, applicationId, userId, status)
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/')
}
