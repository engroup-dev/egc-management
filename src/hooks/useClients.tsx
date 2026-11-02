import { useCallback, useState } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import { Clients, Projects } from "../types/global.type";
import { ClientFormValues } from "../types/schema/clients.schema";
import { adminCreateUser } from "../lib/adminApi";
import { PostgrestError } from "@supabase/supabase-js";

// The Client role. Was written out as a bare uuid in two places; one
// constant so they cannot drift apart.
const CLIENT_ROLE_ID = "803c44ac-0af1-4586-81a2-67e1bc7eb7ef";

export const crmClientsKey = ["crm", "clients"] as const;

async function fetchClients(): Promise<Clients[]> {
  const { data, error } = await supabase.from("clients").select("*");
  if (error) {
    console.error("error fetching clients", error);
    throw error;
  }
  return data ?? [];
}

// Exported so the background prefetcher can warm this screen.
export const crmClientsQueryOptions = () =>
  queryOptions({ queryKey: crmClientsKey, queryFn: fetchClients });

export function useClients() {
  const queryClient = useQueryClient();
  const query = useQuery(crmClientsQueryOptions());
  // NewClientForm reads `loading` / `error` for its own submit.
  const [mutating, setMutating] = useState(false);
  // PostgrestError / AuthError / Error: the screens only read .message
  const [mutationError, setMutationError] = useState<{
    message: string;
  } | null>(null);

  const addClient = useCallback(async (payload: ClientFormValues) => {
    setMutating(true);
    setMutationError(null);

    try {
      let userId: string | null = null;
      const hasAuth = !!payload.email && !!payload.password;

      if (hasAuth) {
        // Created by the admin-users Edge Function, which checks the
        // manage_clients permission and forces roleId / partyType.
        const { data: userData, error: userError } = await adminCreateUser(
          "client",
          {
            email: payload.email as string,
            password: payload.password as string,
            userMetadata: {
              role: "Client",
              firstName: payload.firstName,
              lastName: payload.lastName,
              nationality: payload.nationality,
              roleId: CLIENT_ROLE_ID,
              // handle_new_user() sets users.party_type from this. Phase 1
              // made the column NOT NULL with no default, so without it
              // the insert fails — see phase8-create-employee.sql.
              partyType: "client",
            },
          },
        );

        if (userError) {
          console.error("Error creating auth user:", userError);
          setMutationError(userError);
          setMutating(false);
          return { data: null, error: userError };
        }

        userId = userData?.user?.id ?? null;

        // ── the missing write ──────────────────────────────────────────
        // This flow created an auth user and never inserted user_roles.
        // Every other creation path in the app does. That single omission
        // is why client accounts hold a users.role_id and resolve to no
        // role at all — phase2-resolver.sql DECISION 7 reads user_roles,
        // not role_id — and it is a named part of Phase 0's 38-account
        // divergence.
        //
        // Written with the signed-in client, like the rows below.
        if (userId) {
          const { error: userRoleError } = await supabase
            .from("user_roles")
            .upsert(
              { user_id: userId, role_id: CLIENT_ROLE_ID },
              { onConflict: "user_id,role_id", ignoreDuplicates: true },
            );

          if (userRoleError) {
            console.error("Error assigning client role:", userRoleError);
            setMutationError(userRoleError);
            setMutating(false);
            return { data: null, error: userRoleError };
          }
        }
      }

      // -----------------------------
      // 2. GET ROLE
      // -----------------------------
      const { data: role, error: roleError } = await supabase
        .from("roles")
        .select("*")
        .eq("id", CLIENT_ROLE_ID)
        .single();

      if (roleError) {
        console.error("error fetching role", roleError);
        setMutationError(roleError);
        setMutating(false);
        return { data: null, error: roleError };
      }

      // -----------------------------
      // 3. CREATE CLIENT (ALWAYS)
      // -----------------------------
      const clientRow = {
        first_name: payload.firstName,
        last_name: payload.lastName,
        email: payload.email ?? undefined,
        phone_number: payload.phone ?? "",
        code: `${role.code}-${role.number}`,
        user_id: userId,
      };

      // For a client WITH a login, the database trigger handle_new_user() has
      // already created the clients row (it does so for every client login).
      // Update that row with the code instead of inserting a second one.
      let existingClientId: string | null = null;
      if (userId) {
        const { data: existing, error: existingError } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (existingError) {
          console.error("error looking up the client row", existingError);
          setMutationError(existingError);
          setMutating(false);
          return { data: null, error: existingError };
        }
        existingClientId = existing?.id ?? null;
      }

      const { data, error } = existingClientId
        ? await supabase
            .from("clients")
            .update(clientRow)
            .eq("id", existingClientId)
            .select()
            .single()
        : await supabase.from("clients").insert([clientRow]).select().single();

      if (error) {
        console.error("error inserting client", error);
        setMutationError(error);
        setMutating(false);
        return { data: null, error };
      }

      // -----------------------------
      // 4. UPDATE ROLE NUMBER ONLY IF USER CREATED
      // -----------------------------
      const { error: numberUpdateError } = await supabase
        .from("roles")
        .update({ number: role.number + 1 })
        .eq("id", role.id);

      if (numberUpdateError) {
        console.error("error updating role number", numberUpdateError);
        setMutationError(numberUpdateError);
        setMutating(false);
        return { data: null, error: numberUpdateError };
      }

      setMutating(false);
      queryClient.invalidateQueries({ queryKey: ["crm"] });
      return { data: data as Clients, error: null };
    } catch (err) {
      console.error("unexpected error inserting client", err);
      setMutationError(err instanceof Error ? err : new Error(String(err)));
      setMutating(false);
      return { data: null, error: err };
    }
  }, [queryClient]);

  const { refetch } = query;
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    clients: query.data ?? [],
    loading: query.isPending || mutating,
    error: mutationError ?? query.error,
    refresh,
    addClient,
  };
}

export const crmClientKey = (id: string) => ["crm", "client", id] as const;

async function fetchClient(id: string): Promise<Clients | null> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    console.error("error fetching clients", error);
    throw error;
  }
  return data ?? null;
}

export const crmClientQueryOptions = (id: string) =>
  queryOptions({
    queryKey: crmClientKey(id),
    queryFn: () => fetchClient(id),
    enabled: !!id,
  });

export function useClient(id: string) {
  const query = useQuery(crmClientQueryOptions(id));
  return {
    client: query.data ?? null,
    loading: query.isPending,
    error: (query.error as PostgrestError | null) ?? undefined,
  };
}

export const crmClientProjectsKey = (clientId: string | undefined) =>
  ["crm", "client-projects", clientId ?? ""] as const;

async function fetchClientProjects(clientId: string): Promise<Projects[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching projects:", error);
    throw error;
  }
  return data ?? [];
}

export const crmClientProjectsQueryOptions = (clientId: string | undefined) =>
  queryOptions({
    queryKey: crmClientProjectsKey(clientId),
    queryFn: () => fetchClientProjects(clientId as string),
    enabled: !!clientId,
  });

// The client's projects on ClientDetailPage. A failed load shows the empty
// list, as it did when this lived inline in the page.
export function useClientProjects(clientId: string | undefined) {
  const query = useQuery(crmClientProjectsQueryOptions(clientId));
  return {
    projects: query.data ?? [],
    loadingProjects: query.isPending,
  };
}
