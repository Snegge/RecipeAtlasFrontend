export interface ShoppingItemResponse {
  id: string;
  text: string;
  purchased: boolean;
  version: string;
  position: number;
  editingBy: string | null;
  reservationExpiresAtUtc: string | null;
}
export interface ShoppingListSummary {
  id: string;
  name: string;
  role: string;
  version: string;
  preview: string[];
  activeCount: number;
  purchasedCount: number;
}
export interface ShoppingMemberResponse {
  userId: string;
  username: string;
  displayName: string;
  role: string;
}
export interface ShoppingPendingInvitation {
  id: string;
  userId: string;
  username: string;
  displayName: string;
}
export interface ShoppingListResponse {
  id: string;
  name: string;
  role: string;
  version: string;
  items: ShoppingItemResponse[];
  members: ShoppingMemberResponse[];
  invitations: ShoppingPendingInvitation[];
}
export interface ShoppingInvitationResponse {
  id: string;
  listId: string;
  listName: string;
  ownerDisplayName: string;
  listVersion: string;
}
export interface ShoppingMutationResponse {
  listId: string;
  version: string | null;
  item: ShoppingItemResponse | null;
  undoUntilUtc: string | null;
}
export interface ShoppingReservationResponse {
  token: string;
  expiresAtUtc: string;
}
export type ShoppingCommand = Readonly<
  { listId: string; operationId: string } & (
    | { kind: 'create'; name: string }
    | { kind: 'rename'; name: string; expectedVersion: string }
    | { kind: 'delete' | 'leave'; expectedVersion: string }
    | { kind: 'invite'; username: string; expectedVersion: string }
    | { kind: 'cancel-invitation'; invitationId: string; expectedVersion: string }
    | { kind: 'respond'; invitationId: string; accept: boolean; expectedVersion: string }
    | { kind: 'remove-member'; userId: string; expectedVersion: string }
    | { kind: 'transfer'; newOwnerUserId: string; expectedVersion: string }
    | { kind: 'add'; id: string; text: string }
    | { kind: 'edit'; id: string; text: string; token: string; expectedVersion: string }
    | { kind: 'purchase'; id: string; purchased: boolean; expectedVersion: string }
    | { kind: 'remove'; id: string; expectedVersion: string }
    | { kind: 'restore'; id: string; deletionOperationId: string }
  )
>;
