import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiUpload } from "../lib/api";
import { useEvent } from "./use-event";
export function useExpenses() {
    const { currentEvent } = useEvent();
    const eventId = currentEvent?.id;
    return useQuery({
        queryKey: ["events", eventId, "expenses"],
        queryFn: () => api(`/events/${eventId}/expenses`),
        enabled: !!eventId,
    });
}
export function useExpenseSummary() {
    const { currentEvent } = useEvent();
    const eventId = currentEvent?.id;
    return useQuery({
        queryKey: ["events", eventId, "summary"],
        queryFn: () => api(`/events/${eventId}/summary`),
        enabled: !!eventId,
    });
}
export function useCreateExpense() {
    const qc = useQueryClient();
    const { currentEvent } = useEvent();
    return useMutation({
        mutationFn: (data) => api(`/events/${currentEvent.id}/expenses`, {
            method: "POST",
            body: JSON.stringify(data),
        }),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "expenses"],
            });
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "summary"],
            });
        },
    });
}
export function useUpdateExpense() {
    const qc = useQueryClient();
    const { currentEvent } = useEvent();
    return useMutation({
        mutationFn: ({ id, ...data }) => api(`/events/${currentEvent.id}/expenses/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "expenses"],
            });
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "summary"],
            });
        },
    });
}
export function useDeleteExpense() {
    const qc = useQueryClient();
    const { currentEvent } = useEvent();
    return useMutation({
        mutationFn: (id) => api(`/events/${currentEvent.id}/expenses/${id}`, { method: "DELETE" }),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "expenses"],
            });
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "summary"],
            });
        },
    });
}
export function useApproveExpense() {
    const qc = useQueryClient();
    const { currentEvent } = useEvent();
    return useMutation({
        mutationFn: (id) => api(`/events/${currentEvent.id}/expenses/${id}/approve`, {
            method: "POST",
        }),
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "expenses"],
            });
        },
    });
}
export function useUploadReceipt() {
    const qc = useQueryClient();
    const { currentEvent } = useEvent();
    return useMutation({
        mutationFn: ({ expenseId, file, tag, }) => {
            const fd = new FormData();
            fd.append("file", file);
            if (tag)
                fd.append("tag", tag);
            return apiUpload(`/events/${currentEvent.id}/expenses/${expenseId}/receipts`, fd);
        },
        onSuccess: () => {
            qc.invalidateQueries({
                queryKey: ["events", currentEvent.id, "expenses"],
            });
        },
    });
}
export function usePlaceAutocomplete() {
    return useQuery({
        queryKey: ["autocomplete", "places"],
        queryFn: () => api("/autocomplete/places"),
        staleTime: 60_000,
    });
}
export function useReceiptTagAutocomplete() {
    return useQuery({
        queryKey: ["autocomplete", "receipt-tags"],
        queryFn: () => api("/autocomplete/receipt-tags"),
        staleTime: 60_000,
    });
}
