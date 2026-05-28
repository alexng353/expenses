import { Navigate } from "react-router";
import { useAuth } from "../../hooks/use-auth";
export function ProtectedRoute({ children }) {
    const { user, isLoading } = useAuth();
    if (isLoading) {
        return (<div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>);
    }
    if (!user) {
        return <Navigate to="/login" replace/>;
    }
    return <>{children}</>;
}
