export interface Person {
  id: number;
  displayName: string;
  /** Set only via an explicit confirmed merge — never automatically. */
  mergedIntoId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonAlias {
  id: number;
  personId: number;
  alias: string;
  createdAt: string;
}
