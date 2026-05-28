import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "../lib/api"
import { useEvent } from "./use-event"
import type {
  Event,
  EventBucket,
  EventMember,
  GrantCategory,
} from "../lib/types"

/** Minimal user shape returned by GET /users (super only). */
export interface AdminUser {
  id: string
  email: string
  name: string
  isSuper: boolean
  archived: boolean
  emailVerified: boolean
  avatarSource: string | null
  createdAt: string
}

export function useAllUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: () => api<AdminUser[]>("/users"),
  })
}

export function useUpdateEvent() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (
      data: Partial<
        Pick<Event, "name" | "description" | "grantMode" | "currency">
      >
    ) =>
      api<Event>(`/events/${currentEvent!.id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] })
    },
  })
}

export function useCreateBucket() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (data: { name: string; sortOrder?: number }) =>
      api<EventBucket>(`/events/${currentEvent!.id}/buckets`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "buckets"],
      })
    },
  })
}

export function useDeleteBucket() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (bucketId: string) =>
      api(`/events/${currentEvent!.id}/buckets/${bucketId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "buckets"],
      })
    },
  })
}

export function useCreateGrantCategory() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (data: { name: string; sortOrder?: number }) =>
      api<GrantCategory>(`/events/${currentEvent!.id}/grant-categories`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "grant-categories"],
      })
    },
  })
}

export function useDeleteGrantCategory() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (categoryId: string) =>
      api(`/events/${currentEvent!.id}/grant-categories/${categoryId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "grant-categories"],
      })
    },
  })
}

export function useAddMember() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (data: {
      userId: string
      role: EventMember["role"]
      canApprove?: boolean
    }) =>
      api<EventMember>(`/events/${currentEvent!.id}/members`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "members"],
      })
    },
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: ({
      memberId,
      ...data
    }: {
      memberId: string
      role?: EventMember["role"]
      canApprove?: boolean
    }) =>
      api<EventMember>(`/events/${currentEvent!.id}/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "members"],
      })
    },
  })
}

export function useRemoveMember() {
  const qc = useQueryClient()
  const { currentEvent } = useEvent()

  return useMutation({
    mutationFn: (memberId: string) =>
      api(`/events/${currentEvent!.id}/members/${memberId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["events", currentEvent!.id, "members"],
      })
    },
  })
}

export function useCreateEvent() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      description?: string
      grantMode?: boolean
    }) =>
      api<Event>("/events", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["events"] })
    },
  })
}
