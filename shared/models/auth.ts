export type User = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  timezone: string;
  authProvider: "local";
  createdAt: string;
  updatedAt: string;
};

export type UpsertUser = Partial<User> & Pick<User, "id">;
