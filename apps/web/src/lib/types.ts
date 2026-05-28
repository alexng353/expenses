export interface User {
  id: string
  email: string
  name: string
  isSuper: boolean
  avatarSource: "google" | "gravatar" | "upload" | null
  avatarThumbnail: string | null
}

export interface Event {
  id: string
  name: string
  description: string | null
  currency: string
  grantMode: boolean
  createdById: string
  createdAt: string
}

export interface EventMember {
  id: string
  userId: string
  role: "readonly" | "write" | "edit_others" | "super"
  canApprove: boolean
  userName: string
  userEmail: string
  userAvatarSource: string | null
}

export interface EventBucket {
  id: string
  eventId: string
  name: string
  sortOrder: number
}

export interface GrantCategory {
  id: string
  eventId: string
  name: string
  sortOrder: number
}

export type ExpenseStatus =
  | "awaiting_approval"
  | "approved"
  | "outstanding"
  | "paid"
  | "reimbursed"

export interface Expense {
  id: string
  eventId: string
  name: string
  amountCents: number
  date: string | null
  placeOfPurchase: string | null
  status: ExpenseStatus
  bucketId: string | null
  paidById: string | null
  createdById: string
  notes: string | null
  motionNumber: number | null
  grantCategoryId: string | null
  grantSubLabel: string | null
  createdAt: string
  updatedAt: string
  paidBy: { name: string; email: string } | null
  receiptCount: number
}

export interface ExpenseReceipt {
  id: string
  expenseId: string
  storageKey: string
  fileName: string
  fileSize: number
  mimeType: string
  tag: string | null
  uploadedById: string
  createdAt: string
}

export interface EventSummary {
  totalCents: number
  totalCount: number
  byBucket: {
    bucketId: string | null
    bucketName: string
    totalCents: number
    count: number
  }[]
  byStatus: Record<string, { totalCents: number; count: number }>
}

export interface AuditEntry {
  id: string
  entityType: string
  entityId: string
  action: "create" | "update" | "delete" | "restore"
  changes: Record<string, { old: unknown; new: unknown }> | null
  createdAt: string
  performedByName: string
  performedByEmail: string
}
