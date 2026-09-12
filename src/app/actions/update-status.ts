'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'
import { updateApplicationStatus } from '@/lib/repository'
import type { ApplicationStatus } from '@/lib/types'

export async function updateStatusAction(applicationId: string, status: ApplicationStatus): Promise<void> {
  const db = createServiceClient()
  await updateApplicationStatus(db, applicationId, status)
  revalidatePath(`/applications/${applicationId}`)
  revalidatePath('/')
}
