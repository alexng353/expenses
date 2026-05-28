/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
    const qc = useQueryClient();
    const { data: user, isLoading } = useQuery({
        queryKey: ["auth", "me"],
        queryFn: () => api("/auth/me").catch(() => null),
        retry: false,
        staleTime: 60_000,
    });
    const loginMutation = useMutation({
        mutationFn: ({ email, password }) => api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["auth"] }),
    });
    const logoutMutation = useMutation({
        mutationFn: () => api("/auth/logout", { method: "POST" }),
        onSuccess: () => {
            qc.setQueryData(["auth", "me"], null);
            qc.clear();
        },
    });
    return (<AuthCtx.Provider value={{
            user: user ?? null,
            isLoading,
            login: async (email, password) => {
                await loginMutation.mutateAsync({ email, password });
            },
            logout: async () => {
                await logoutMutation.mutateAsync();
            },
        }}>
      {children}
    </AuthCtx.Provider>);
}
export function useAuth() {
    const ctx = useContext(AuthCtx);
    if (!ctx)
        throw new Error("useAuth must be used within AuthProvider");
    return ctx;
}
