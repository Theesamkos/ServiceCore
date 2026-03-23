import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "manager" | "employee";
  displayName: string;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const demoUsers: Record<string, AuthUser> = {
  admin: { id: 1, username: "admin", role: "admin", displayName: "System Admin" },
  lisa: { id: 2, username: "lisa", role: "admin", displayName: "Lisa Davis" },
  derek: { id: 3, username: "derek", role: "manager", displayName: "Derek Ops" },
  ray: { id: 4, username: "ray", role: "manager", displayName: "Ray Thompson" },
};

const demoPasswords: Record<string, string> = {
  admin: "admin123",
  lisa: "lisa123",
  derek: "derek123",
  ray: "ray123",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem("servicecore_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    if (demoPasswords[username] === password) {
      const authUser = demoUsers[username];
      setUser(authUser);
      localStorage.setItem("servicecore_user", JSON.stringify(authUser));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("servicecore_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
