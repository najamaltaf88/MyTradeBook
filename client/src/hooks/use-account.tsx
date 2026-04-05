import React, { createContext, useContext, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Mt5Account } from "@shared/schema";

interface AccountContextType {
  accounts: Mt5Account[];
  selectedAccountId: string | null;
  selectedAccount: Mt5Account | null;
  selectAccount: (id: string | null) => void;
  queryParam: string;
}

const AccountContext = createContext<AccountContextType>({
  accounts: [],
  selectedAccountId: null,
  selectedAccount: null,
  selectAccount: () => {},
  queryParam: "",
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const { data: accounts = [] } = useQuery<Mt5Account[]>({
    queryKey: ["/api/accounts"],
  });

  const selectedAccount = selectedAccountId
    ? accounts.find((a) => a.id === selectedAccountId) || null
    : null;

  const queryParam = selectedAccountId ? `?accountId=${selectedAccountId}` : "";

  const selectAccount = useCallback((id: string | null) => {
    setSelectedAccountId(id);
  }, []);

  const value = { accounts, selectedAccountId, selectedAccount, selectAccount, queryParam };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
