/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
const EventCtx = createContext(null);
export function EventProvider({ children }) {
    const [currentEventId, setCurrentEventId] = useState(null);
    const { data: events = [], isLoading: eventsLoading } = useQuery({
        queryKey: ["events"],
        queryFn: () => api("/events"),
    });
    const currentEvent = events.find((e) => e.id === currentEventId) ?? events[0] ?? null;
    const eventId = currentEvent?.id;
    const { data: members = [] } = useQuery({
        queryKey: ["events", eventId, "members"],
        queryFn: () => api(`/events/${eventId}/members`),
        enabled: !!eventId,
    });
    const { data: buckets = [] } = useQuery({
        queryKey: ["events", eventId, "buckets"],
        queryFn: () => api(`/events/${eventId}/buckets`),
        enabled: !!eventId,
    });
    const { data: grantCategories = [] } = useQuery({
        queryKey: ["events", eventId, "grant-categories"],
        queryFn: () => api(`/events/${eventId}/grant-categories`),
        enabled: !!eventId && currentEvent?.grantMode === true,
    });
    return (<EventCtx.Provider value={{
            events,
            currentEvent,
            setCurrentEventId: (id) => setCurrentEventId(id),
            members,
            buckets,
            grantCategories,
            isLoading: eventsLoading,
        }}>
      {children}
    </EventCtx.Provider>);
}
export function useEvent() {
    const ctx = useContext(EventCtx);
    if (!ctx)
        throw new Error("useEvent must be used within EventProvider");
    return ctx;
}
