/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react"
import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "../lib/api"
import type {
  Event,
  EventMember,
  EventBucket,
  GrantCategory,
} from "../lib/types"

interface EventContext {
  events: Event[]
  currentEvent: Event | null
  setCurrentEventId: (id: string) => void
  members: EventMember[]
  buckets: EventBucket[]
  grantCategories: GrantCategory[]
  isLoading: boolean
}

const EventCtx = createContext<EventContext | null>(null)

export function EventProvider({ children }: { children: ReactNode }) {
  const [currentEventId, setCurrentEventId] = useState<string | null>(null)

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => api<Event[]>("/events"),
  })

  const currentEvent =
    events.find((e) => e.id === currentEventId) ?? events[0] ?? null
  const eventId = currentEvent?.id

  const { data: members = [] } = useQuery({
    queryKey: ["events", eventId, "members"],
    queryFn: () => api<EventMember[]>(`/events/${eventId}/members`),
    enabled: !!eventId,
  })

  const { data: buckets = [] } = useQuery({
    queryKey: ["events", eventId, "buckets"],
    queryFn: () => api<EventBucket[]>(`/events/${eventId}/buckets`),
    enabled: !!eventId,
  })

  const { data: grantCategories = [] } = useQuery({
    queryKey: ["events", eventId, "grant-categories"],
    queryFn: () => api<GrantCategory[]>(`/events/${eventId}/grant-categories`),
    enabled: !!eventId && currentEvent?.grantMode === true,
  })

  return (
    <EventCtx.Provider
      value={{
        events,
        currentEvent,
        setCurrentEventId: (id) => setCurrentEventId(id),
        members,
        buckets,
        grantCategories,
        isLoading: eventsLoading,
      }}
    >
      {children}
    </EventCtx.Provider>
  )
}

export function useEvent() {
  const ctx = useContext(EventCtx)
  if (!ctx) throw new Error("useEvent must be used within EventProvider")
  return ctx
}
